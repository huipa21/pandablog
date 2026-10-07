import { createServer } from 'node:http'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { WriteBarrier } from '../../server/utils/maintenance'
import { wrapMaintenanceHandler } from '../../server/utils/maintenance-handler'

function deferred() {let resolve!: () => void; const promise = new Promise<void>(yes => {resolve = yes}); return {resolve, promise}}

describe('actual H3 handler lifetime and restore admission', () => {
  it('retains disconnected/in-flight saves until actual completion; no auth/backup prefix mutation bypass', async () => {
    const barrier = new WriteBarrier(), native = deferred(), started = deferred()
    let writes = 0
    const app = createApp()
    app.use(defineEventHandler(async event => {
      if (event.path === '/api/save') {started.resolve(); await native.promise; await barrier.run(async () => {writes++}); return {ok: true}}
      return {ok: true}
    }))
    app.handler = wrapMaintenanceHandler(app.handler, barrier)
    const server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as {port: number}).port}`
    const abort = new AbortController()
    try {
      const request = fetch(`${base}/api/save`, {method: 'POST', signal: abort.signal}).catch(() => {})
      await started.promise
      const owner = {}, drain = barrier.close(owner, 1000)
      abort.abort(); await request
      expect(barrier.status().active).toBe(1)
      for (const path of ['/api/auth/setup', '/api/auth/login', '/api/admin/backups/import', '/api/admin/backups/example/restore', '/api/admin/backups/status/forged']) {
        const response = await fetch(`${base}${path}`, {method: 'POST'})
        expect(response.status).toBe(503); await response.arrayBuffer()
      }
      expect((await fetch(`${base}/api/health`)).status).toBe(200)
      expect((await fetch(`${base}/api/admin/backups/status`)).status).toBe(200)
      native.resolve(); await drain
      expect(writes).toBe(1)
      await barrier.runOwner(owner, async () => {})
      barrier.reopen(owner)
      expect(barrier.status().active).toBe(0)
    } finally {native.resolve(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))}
  })

  it('returns a no-store 503 without entering Nitro/Nuxt error rendering or local error-page fetch', async () => {
    const barrier = new WriteBarrier(), owner = {}
    await barrier.close(owner)
    const onError = vi.fn(), onRequest = vi.fn(), original = vi.fn(() => ({ok: true}))
    const app = createApp({onRequest, onError})
    app.use(defineEventHandler(original))
    app.handler = wrapMaintenanceHandler(app.handler, barrier)
    const server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as {port: number}).port}`
    try {
      for (const path of ['/login', '/__nuxt_error?url=%2Flogin', '/api/auth/setup']) {
        const response = await fetch(`${base}${path}`, {headers: {accept: 'text/html'}})
        expect(response.status).toBe(503)
        expect(response.headers.get('retry-after')).toBe('15')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('content-type')).toBe('application/json')
        expect(await response.json()).toEqual({statusCode: 503, statusMessage: 'Service Unavailable', message: 'Maintenance is fenced', data: {retryAfterSec: 15}})
      }
      expect(onRequest).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
      expect(original).not.toHaveBeenCalled()
      barrier.reopen(owner)
      expect((await fetch(`${base}/login`)).status).toBe(200)
      expect(original).toHaveBeenCalledOnce()
    } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))}
  })

  it('renders escaped startup guidance without SSR and keeps APIs as JSON', async () => {
    const barrier = new WriteBarrier()
    await barrier.close({})
    const original = vi.fn(), onError = vi.fn()
    const app = createApp({onError})
    app.use(defineEventHandler(original))
    app.handler = wrapMaintenanceHandler(app.handler, barrier, () => ({message: 'Check <username> & restart', action: 'fix-config-and-restart', recoveryRequired: false}))
    const server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as {port: number}).port}`
    try {
      const response = await fetch(`${base}/login`, {headers: {accept: 'text/html'}})
      expect(response.status).toBe(503)
      expect(response.headers.get('content-type')).toContain('text/html')
      expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
      const html = await response.text()
      expect(html).toContain('Check &lt;username&gt; &amp; restart')
      expect(html).not.toMatch(/<script|Recovery protection is active/)
      const api = await fetch(`${base}/api/auth/login`, {headers: {accept: 'text/html'}})
      expect(api.headers.get('content-type')).toBe('application/json')
      expect(await api.json()).toMatchObject({data: {action: 'fix-config-and-restart', recoveryRequired: false}})
      expect(original).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))}
  })

  it('uncertain transport writes block destructive ownership without pretending cancellation', async () => {
    const barrier = new WriteBarrier(), persist = vi.fn().mockResolvedValue(undefined)
    barrier.observeUncertainty(persist)
    await barrier.noteUncertain()
    await expect(barrier.close({})).rejects.toThrow(/uncertain/i)
    expect(persist).toHaveBeenCalledOnce()
    expect(barrier.status().closed).toBe(false) // ordinary service need not wipe anything
    const clean = new WriteBarrier(), owner = {}, key = clean.cacheGeneration()
    await clean.close(owner); clean.reopen(owner)
    expect(clean.cacheGeneration()).not.toBe(key)
  })
})
