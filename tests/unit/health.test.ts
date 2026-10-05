import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ useDb: vi.fn(), queryDb: vi.fn(), getQuery: vi.fn(), setResponseHeader: vi.fn(), setResponseStatus: vi.fn() }))
vi.mock('../../server/utils/db', () => mocks)
const event = {} as H3Event
const db = {}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('getQuery', mocks.getQuery)
  vi.stubGlobal('setResponseHeader', mocks.setResponseHeader)
  vi.stubGlobal('setResponseStatus', mocks.setResponseStatus)
  mocks.getQuery.mockReturnValue({})
  mocks.useDb.mockResolvedValue(db)
  mocks.queryDb.mockResolvedValue([1])
  vi.spyOn(process, 'uptime').mockReturnValue(123.456)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function handler() {
  return (await import('../../server/api/health.get')).default
}

describe('lightweight health handler', () => {
  it('returns only liveness/uptime without DB or build information and disables caching', async () => {
    expect(await (await handler())(event)).toEqual({ ok: true, uptime_s: 123 })
    expect(mocks.setResponseHeader).toHaveBeenCalledExactlyOnceWith(event, 'Cache-Control', 'no-store')
    expect(mocks.setResponseStatus).not.toHaveBeenCalled()
    expect(mocks.useDb).not.toHaveBeenCalled()
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it.each([undefined, '0', 'true', '1.0', ['1', '1']])('only enables the optional DB check for exactly db=1 (%j)', async (value) => {
    mocks.getQuery.mockReturnValue({ db: value })
    expect(await (await handler())(event)).toEqual({ ok: true, uptime_s: 123 })
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it('pings only when requested, with a two-second query timeout and no reconnect retry', async () => {
    vi.useFakeTimers()
    mocks.getQuery.mockReturnValue({ db: '1' })
    expect(await (await handler())(event)).toEqual({ ok: true, uptime_s: 123 })
    expect(mocks.queryDb).toHaveBeenCalledExactlyOnceWith(db, 'RETURN 1;', undefined, { label: 'health DB probe', timeoutMs: 2000, retryOnReconnect: false })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['connection', 'query'])('returns a generic non-cached 503 for a %s failure without leaking details', async (phase) => {
    mocks.getQuery.mockReturnValue({ db: '1' })
    if (phase === 'connection') mocks.useDb.mockRejectedValue(new Error('secret connection details'))
    else mocks.queryDb.mockRejectedValue(new Error('secret query details'))
    expect(await (await handler())(event)).toEqual({ ok: false, db: 'down' })
    expect(mocks.setResponseStatus).toHaveBeenCalledExactlyOnceWith(event, 503)
    expect(mocks.setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'no-store')
    if (phase === 'connection') expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it.each(['connection', 'query'])('bounds a hanging %s stage to two seconds overall', async (phase) => {
    vi.useFakeTimers()
    mocks.getQuery.mockReturnValue({ db: '1' })
    if (phase === 'connection') mocks.useDb.mockReturnValue(new Promise(() => {}))
    else mocks.queryDb.mockReturnValue(new Promise(() => {}))
    const request = (await handler())(event)
    await vi.advanceTimersByTimeAsync(1999)
    expect(mocks.setResponseStatus).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await request).toEqual({ ok: false, db: 'down' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('includes connection time in the overall deadline', async () => {
    vi.useFakeTimers()
    mocks.getQuery.mockReturnValue({ db: '1' })
    mocks.useDb.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(db), 1500)))
    mocks.queryDb.mockReturnValue(new Promise(() => {}))
    const request = (await handler())(event)
    await vi.advanceTimersByTimeAsync(1500)
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(await request).toEqual({ ok: false, db: 'down' })
  })

  it('handles late probe rejections after the HTTP deadline without changing the response', async () => {
    vi.useFakeTimers()
    mocks.getQuery.mockReturnValue({ db: '1' })
    let reject!: (error: Error) => void
    mocks.queryDb.mockReturnValue(new Promise((_, rejectPromise) => { reject = rejectPromise }))
    const request = (await handler())(event)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await request).toEqual({ ok: false, db: 'down' })
    reject(new Error('late DB failure'))
    await Promise.resolve()
    expect(mocks.setResponseStatus).toHaveBeenCalledTimes(1)
  })
})
