import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logError = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/logging', () => ({ logError }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('useRuntimeConfig', vi.fn(() => ({ public: {} })))
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function install() {
  const { default: plugin } = await import('../../server/plugins/logging-error-hook')
  const hook = vi.fn()
  plugin({ hooks: { hook } } as unknown as Parameters<typeof plugin>[0])
  return hook
}

function handler(hook: ReturnType<typeof vi.fn>) {
  return hook.mock.calls[0]?.[1] as (error: unknown, context?: { event?: unknown }) => void
}

const event = {
  context: { requestId: 'request-123' },
  path: '/api/test',
  node: { req: { method: 'POST' }, res: { statusCode: 502 } }
}

describe('Nitro error hook', () => {
  it('passes resolved status and request context to logError', async () => {
    const hook = await install()
    expect(hook).toHaveBeenCalledWith('error', expect.any(Function))
    const error = createError({ statusCode: 503, message: 'failure', fatal: true, unhandled: true, cause: new Error('inner') })
    handler(hook)(error, { event })
    expect(logError).toHaveBeenCalledExactlyOnceWith(error, { request_id: 'request-123', path: '/api/test', method: 'POST', status_code: 503, source: 'nitro.error_hook' })
  })

  it('uses error.status when statusCode is absent', async () => {
    const hook = await install()
    const error = Object.assign(new Error('failure'), { status: 501 })
    handler(hook)(error, { event })
    expect(logError).toHaveBeenCalledWith(error, expect.objectContaining({ status_code: 501 }))
  })

  it('falls back to response status when the error has no status', async () => {
    const hook = await install()
    const error = new Error('failure')
    handler(hook)(error, { event })
    expect(logError).toHaveBeenCalledWith(error, expect.objectContaining({ status_code: 502 }))
  })

  it('handles errors without a request and defaults to 500', async () => {
    const hook = await install()
    const error = new Error('background failure')
    handler(hook)(error)
    expect(logError).toHaveBeenCalledWith(error, { request_id: null, path: null, method: null, status_code: 500, source: 'nitro.error_hook' })
  })
})
