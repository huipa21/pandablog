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
