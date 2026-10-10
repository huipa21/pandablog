import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, defineEventHandler, getRequestURL, setResponseHeader, toNodeListener } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureRequestId } from '../../server/utils/request-id'
import { wrapMaintenanceHandler } from '../../server/utils/maintenance-handler'
import { WriteBarrier } from '../../server/utils/maintenance'

let server: Server | undefined
async function serve(handler: ReturnType<typeof defineEventHandler>) {
  const app = createApp()
  app.use(handler)
  server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
afterEach(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()))
    server = undefined
  }
  vi.unstubAllGlobals()
})

describe('request correlation without access logging', () => {
  it('ignores inbound IDs, is idempotent and repairs a stale cached response header', async () => {
    const base = await serve(defineEventHandler(event => {
      const first = ensureRequestId(event)
      setResponseHeader(event, 'x-request-id', 'stale-cache-value')
      expect(ensureRequestId(event)).toBe(first)
      return { request_id: event.context.requestId }
    }))
    const ids = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      const response = await fetch(base, { headers: { 'x-request-id': index ? 'spoofed' : 'x'.repeat(4096) } })
      const id = response.headers.get('x-request-id')
      expect(id).toMatch(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
      expect(await response.json()).toEqual({ request_id: id })
      return id
    }))
    expect(new Set(ids).size).toBe(8)
  })

  it('keeps exact health probes ID-free, not health-like or formerly excluded paths', async () => {
    const base = await serve(defineEventHandler(event => {
      ensureRequestId(event)
      return { path: getRequestURL(event).pathname }
    }))
    for (const path of ['/api/health', '/api/health/', '/api/health?db=1']) {
      expect((await fetch(base + path)).headers.get('x-request-id')).toBeNull()
    }
    for (const path of ['/api/healthz', '/api/health/details', '/api/admin/logs/stats', '/__nuxt_error', '/_nuxt/test']) {
      expect((await fetch(base + path)).headers.get('x-request-id')).toBeTruthy()
    }
  })

  it('assigns IDs before the outer maintenance fence without opening ordinary work', async () => {
    const barrier = new WriteBarrier()
    const owner = {}
    await barrier.close(owner)
    const original = vi.fn(defineEventHandler(() => ({ unexpected: true })))
    const base = await serve(wrapMaintenanceHandler(original, barrier))
    const response = await fetch(base + '/api/posts')
    expect(response.status).toBe(503)
    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(response.headers.get('retry-after')).toBe('15')
    expect(original).not.toHaveBeenCalled()
    const health = await fetch(base + '/api/health')
    expect(health.headers.get('x-request-id')).toBeNull()
    expect(original).toHaveBeenCalledOnce()
  })
})
