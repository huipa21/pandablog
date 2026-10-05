import { createServer } from 'node:http'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs()})

describe('real H3 browser mutation origin boundary (no app/DB data)', () => {
  it('protects login/logout/setup and exact scheme/host/port; missing metadata needs explicit non-browser policy', async () => {
    vi.stubGlobal('defineEventHandler', defineEventHandler)
    vi.stubGlobal('useRuntimeConfig', () => ({appOrigin: 'https://fixture.example:8443'}))
    const {default: guard} = await import('../../server/middleware/api-origin')
    let mutations = 0
    const app = createApp(); app.use(guard); app.use(defineEventHandler(event => {if (event.method === 'POST') mutations++; return {ok: true}}))
    const server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as {port: number}).port}`
    const post = (path: string, headers: Record<string, string>) => fetch(base + path, {method: 'POST', headers, body: '{}'})
    try {
      for (const path of ['/api/auth/login', '/api/auth/logout', '/api/auth/setup', '/api/_auth/session']) {
        expect((await post(path, {origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain'})).status).toBe(403)
        expect((await post(path, {origin: 'https://sibling.fixture.example:8443', 'sec-fetch-site': 'same-site', 'content-type': 'application/x-www-form-urlencoded'})).status).toBe(403)
        expect((await post(path, {})).status).toBe(403)
      }
      expect(mutations).toBe(0)
      for (const origin of ['http://fixture.example:8443', 'https://fixture.example', 'null', 'https://user@fixture.example:8443']) expect((await post('/api/auth/login', {origin})).status).toBe(403)
      expect((await post('/api/auth/login', {origin: 'https://fixture.example:8443', 'sec-fetch-site': 'same-origin', 'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'http'})).status).toBe(200)
      expect((await post('/api/auth/logout', {'x-pandablog-client': 'non-browser'})).status).toBe(200)
      expect((await post('/api/auth/setup', {'x-pandablog-client': 'non-browser', origin: 'https://evil.example'})).status).toBe(403)
      expect((await fetch(base + '/api/auth/setup-status')).status).toBe(200)
      expect(mutations).toBe(2)
      vi.stubEnv('NODE_ENV', 'production'); vi.stubGlobal('useRuntimeConfig', () => ({appOrigin: ''}))
      expect((await post('/api/auth/login', {'x-pandablog-client': 'non-browser'})).status).toBe(503)
    } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))}
  })
})
