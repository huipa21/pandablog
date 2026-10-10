import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

const mocks = vi.hoisted(() => ({ queryDb: vi.fn(), useDb: vi.fn().mockResolvedValue({}) }))
vi.mock('../../server/utils/db', () => ({ ...mocks, queryDbRecord: vi.fn() }))

let stderr: MockInstance<typeof process.stderr.write>
let stdout: MockInstance<typeof process.stdout.write>
let originalListeners: ReturnType<typeof process.stderr.listeners>

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('LOG_CONSOLE', 'errors')
  vi.stubEnv('LOG_FORMAT', 'json')
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: {} }))
  originalListeners = process.stderr.listeners('error')
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})
afterEach(() => {
  for (const listener of process.stderr.listeners('error')) {
    if (!originalListeners.includes(listener)) process.stderr.removeListener('error', listener)
  }
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function load(settings: Record<string, unknown> = {}) {
  mocks.queryDb.mockResolvedValue([[{ value: settings }]])
  const logging = await import('../../server/utils/logging')
  await logging.initializeLoggingSettings()
  mocks.queryDb.mockClear()
  return logging
}

function consoleEntries(): Array<Record<string, any>> {
  return stderr.mock.calls.map(call => JSON.parse(String(call[0])))
}

function storedEntries(): Array<Record<string, any>> {
  return mocks.queryDb.mock.calls.filter(call => String(call[1]).includes('CREATE error_logs CONTENT $entry RETURN NONE;')).map(call => call[2].entry)
}

describe('error capture routing', () => {
  it.each([399, 400, 401, 404, 499])('ignores hook status %i in both sinks by default, even in all mode', async (statusCode) => {
    vi.stubEnv('LOG_CONSOLE', 'all')
    const logging = await load({ console_output: true })
    logging.logError(createError({ statusCode, message: 'ignored' }), { source: 'nitro.error_hook' })
    await Promise.resolve()
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).not.toHaveBeenCalled()
    expect(mocks.useDb).toHaveBeenCalledTimes(1) // Settings initialization only.
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it('filters fallback response statuses from the hook context', async () => {
    const logging = await load()
    logging.logError(new Error('ignored'), { source: 'nitro.error_hook', status_code: 404 })
    await Promise.resolve()
    expect(stderr).not.toHaveBeenCalled()
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it.each([500, 503, 599])('stores status %i and prints exactly one line with stack/request context', async (statusCode) => {
    const logging = await load()
    const error = createError({ statusCode, message: 'server failure' })
    logging.logError(error, { source: 'nitro.error_hook', request_id: 'request-123', path: '/api/test', method: 'POST' })
    await Promise.resolve()
    expect(stderr).toHaveBeenCalledTimes(1)
    expect(String(stderr.mock.calls[0]?.[0]).trim()).not.toContain('\n')
    expect(consoleEntries()[0]).toMatchObject({ kind: 'error_log', status: statusCode, request_id: 'request-123', err: { stack: error.stack } })
    expect(storedEntries()[0]).toMatchObject({ status_code: statusCode, request_id: 'request-123', path: '/api/test', method: 'POST', context: { source: 'nitro.error_hook' } })
  })

  it.each([401, 404])('never filters explicit application logError calls with status %i', async (statusCode) => {
    const logging = await load()
    logging.logError(createError({ statusCode, message: 'application diagnostic' }), { source: 'app.test' })
    await Promise.resolve()
    expect(stderr).toHaveBeenCalledTimes(1)
    expect(consoleEntries()[0]?.status).toBe(statusCode)
    expect(storedEntries()[0]?.status_code).toBe(statusCode)
  })

  it('uses statusCode before status before context status_code before 500', async () => {
    const logging = await load()
    logging.logError(Object.assign(new Error('one'), { statusCode: 503, status: 502 }), { status_code: 501 })
    logging.logError(Object.assign(new Error('two'), { status: 502 }), { status_code: 501 })
    logging.logError(new Error('three'), { status_code: 501 })
    logging.logError(new Error('four'))
    await Promise.resolve()
    expect(consoleEntries().map(entry => entry.status)).toEqual([503, 502, 501, 500])
    expect(storedEntries().map(entry => entry.status_code)).toEqual([503, 502, 501, 500])
  })

  it('applies threshold updates immediately, while explicit calls bypass the filter', async () => {
    const logging = await load({ error_log_min_status: 501 })
    logging.logError(createError({ statusCode: 500 }), { source: 'nitro.error_hook' })
    expect(stderr).not.toHaveBeenCalled()
    await logging.updateLoggingSettings({ error_log_min_status: 400 })
    logging.logError(createError({ statusCode: 404 }), { source: 'nitro.error_hook' })
    await logging.updateLoggingSettings({ error_log_min_status: 599 })
    logging.logError(createError({ statusCode: 503 }), { source: 'nitro.error_hook' })
    logging.logError(createError({ statusCode: 401 }))
    await Promise.resolve()
    expect(consoleEntries().map(entry => entry.status)).toEqual([404, 401])
    expect(storedEntries().map(entry => entry.status_code)).toEqual([404, 401])
  })

  it('persists a bounded stack-free cause chain and true H3 flags, with redaction in both sinks', async () => {
    const logging = await load({ redact_fields: ['password', 'name'] })
    const error = createError({
      statusCode: 500, message: 'crash', unhandled: true, fatal: true,
      cause: new TypeError('one', { cause: new Error('two', { cause: new Error('three', { cause: new Error('four') }) }) })
    })
    logging.logError(error, { source: 'nitro.error_hook', password: 'secret', extra: 'kept' })
    await Promise.resolve()
    const chain = { name: '[REDACTED]', message: 'one', cause: { name: '[REDACTED]', message: 'two', cause: { name: '[REDACTED]', message: 'three' } } }
    expect(storedEntries()[0]?.context).toEqual({ source: 'nitro.error_hook', password: '[REDACTED]', extra: 'kept', cause: chain, unhandled: true, fatal: true })
    expect(consoleEntries()[0]?.ctx).toEqual(storedEntries()[0]?.context)
    expect(consoleEntries()[0]?.err.cause).toEqual(chain)
  })

  it('does not mark intentional H3 errors as crashes', async () => {
    const logging = await load()
    logging.logError(createError({ statusCode: 500, message: 'intentional' }), { source: 'nitro.error_hook' })
    await Promise.resolve()
    expect(storedEntries()[0]?.context.source).toBe('nitro.error_hook')
    expect(storedEntries()[0]?.context).not.toHaveProperty('unhandled')
    expect(storedEntries()[0]?.context).not.toHaveProperty('fatal')
  })

  it('continues printing captured errors with storage disabled, but still filters hook 4xx', async () => {
    const logging = await load({ enabled: false, error_log_enabled: false })
    logging.logError(createError({ statusCode: 404 }), { source: 'nitro.error_hook' })
    logging.logError(createError({ statusCode: 500 }), { source: 'nitro.error_hook' })
    expect(consoleEntries().map(entry => entry.status)).toEqual([500])
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it('stores status/cause/flags without console output when hard-off is configured', async () => {
    vi.stubEnv('LOG_CONSOLE', 'off')
    const logging = await load()
    logging.logError(createError({ statusCode: 503, fatal: true, cause: new Error('inner') }), { source: 'nitro.error_hook' })
    await Promise.resolve()
    expect(stderr).not.toHaveBeenCalled()
    expect(storedEntries()[0]).toMatchObject({ status_code: 503, context: { fatal: true, cause: { name: 'Error', message: 'inner' } } })
  })
})

describe('error group write routing', () => {
  it('emits all 100 fingerprints to console, stores only 20 samples, and flushes all trailing counts after one second', async () => {
    vi.useFakeTimers()
    const logging = await load()
    const error = new Error('same storm')
    for (let index = 0; index < 100; index++) logging.logError(error, { path: '/api/test', request_id: `request-${index}` })
    const { waitForErrorGroupWrites } = await import('../../server/utils/error-group-write')
    await waitForErrorGroupWrites()
    expect(consoleEntries()).toHaveLength(100)
    const fingerprints = new Set(consoleEntries().map(entry => entry.fingerprint))
    expect(fingerprints.size).toBe(1)
    expect(storedEntries()).toHaveLength(20)
    expect(storedEntries()[0]?.timestamp).toBeInstanceOf(Date)
    await vi.advanceTimersByTimeAsync(1000)
    await waitForErrorGroupWrites()
    const writes = mocks.queryDb.mock.calls.filter(call => String(call[1]).includes('UPSERT type::record(\'error_groups\''))
    expect(writes).toHaveLength(21)
    expect(writes.reduce((sum, call) => sum + call[2].count, 0)).toBe(100)
    expect(writes.at(-1)?.[2].count).toBe(80)
    expect(writes.at(-1)?.[1]).not.toContain('CREATE error_logs')
    vi.useRealTimers()
  })

  it.each([1, 50, 500])('accepts occurrence cap %s and defaults legacy settings to 50', async cap => {
    const logging = await load()
    expect(logging.getLoggingSettings().error_occurrences_per_group).toBe(50)
    await logging.updateLoggingSettings({ error_occurrences_per_group: cap })
    expect(logging.getLoggingSettings().error_occurrences_per_group).toBe(cap)
    await logging.resetLoggingSettings()
    expect(logging.getLoggingSettings().error_occurrences_per_group).toBe(50)
  })

  it.each([0, 501, 1.5, '50', null])('rejects invalid occurrence caps (%s), normalizing saved values to 50', async cap => {
    const logging = await load({ error_occurrences_per_group: cap })
    expect(logging.getLoggingSettings().error_occurrences_per_group).toBe(50)
    expect(() => logging.validateLoggingSettingsUpdate({ error_occurrences_per_group: cap })).toThrow()
  })
})

describe('error capture settings', () => {
  it('defaults legacy records to 500, persists updates, and resets to 500', async () => {
    const logging = await load()
    expect(logging.defaultLoggingSettings().error_log_min_status).toBe(500)
    expect(logging.getLoggingSettings().error_log_min_status).toBe(500)
    await logging.updateLoggingSettings({ error_log_min_status: 400 })
    expect(logging.getLoggingSettings().error_log_min_status).toBe(400)
    expect(mocks.queryDb.mock.calls.at(-1)?.[2].value.error_log_min_status).toBe(400)
    await logging.resetLoggingSettings()
    expect(logging.getLoggingSettings().error_log_min_status).toBe(500)
  })

  it.each([400, 499, 500, 599])('accepts and normalizes threshold %i', async (value) => {
    const logging = await load({ error_log_min_status: value })
    expect(logging.getLoggingSettings().error_log_min_status).toBe(value)
    expect(logging.validateLoggingSettingsUpdate({ error_log_min_status: value })).toEqual({ error_log_min_status: value })
  })

  it.each([399, 600, 500.5, '500', null, Number.NaN])('rejects invalid updates and falls back for invalid stored values (%s)', async (value) => {
    const logging = await load({ error_log_min_status: value })
    expect(logging.getLoggingSettings().error_log_min_status).toBe(500)
    expect(() => logging.validateLoggingSettingsUpdate({ error_log_min_status: value })).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })
})
