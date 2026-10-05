import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryDb: vi.fn(),
  useDb: vi.fn().mockResolvedValue({}),
  appendAccessLog: vi.fn()
}))
vi.mock('../../server/utils/db', () => ({ ...mocks, queryDbRecord: vi.fn() }))
vi.mock('../../server/utils/access-log-store', () => ({ appendAccessLog: mocks.appendAccessLog, maintainAccessLogFiles: vi.fn(), purgeAccessLogFiles: vi.fn() }))
vi.mock('../../server/utils/access-log-reader', () => ({ accessStats: vi.fn(), readAccessLogById: vi.fn() }))

const access = { method: 'GET', path: '/test', status_code: 200, response_time_ms: 12, request_id: 'request-123', user_agent: 'test-browser' }
const activity = { action: 'test.action', resource_type: 'test', description: 'Test activity' }
let stdout: MockInstance<typeof process.stdout.write>
let stderr: MockInstance<typeof process.stderr.write>

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('__PB_MODULE_LOGS__', true)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: {} } }))
  vi.stubEnv('LOG_CONSOLE', 'errors')
  vi.stubEnv('LOG_FORMAT', 'json')
  stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function load(settings: Record<string, unknown> = {}) {
  mocks.queryDb.mockResolvedValue([[{ value: settings }]])
  const logging = await import('../../server/utils/logging')
  await logging.initializeLoggingSettings()
  mocks.queryDb.mockClear()
  return logging
}

function lines(spy: typeof stdout): Array<Record<string, any>> {
  return spy.mock.calls.map(call => JSON.parse(String(call[0])))
}

describe('public logging console routing', () => {
  it('defaults to one error line on stderr, with stack and request id', async () => {
    const logging = await load()
    const err = new TypeError('oops')
    logging.logError(err, { request_id: 'request-123', path: '/api/test', method: 'POST', source: 'nitro.error_hook' })
    logging.logAccess(access)
    logging.logActivity(activity)
    logging.info('hidden')
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).toHaveBeenCalledTimes(1)
    expect(lines(stderr)[0]).toMatchObject({
      level: 'error', kind: 'error_log', msg: 'oops', request_id: 'request-123', path: '/api/test', method: 'POST',
      err: { name: 'TypeError', message: 'oops', stack: err.stack }, ctx: { source: 'nitro.error_hook' }
    })
  })

  it('prints errors/warnings even with storage disabled and a restrictive log_level', async () => {
    const logging = await load({ enabled: false, error_log_enabled: false, log_level: 'error' })
    logging.logError(new Error('oops'))
    logging.warn('warning')
    logging.error('helper error')
    expect(lines(stderr).map(line => line.kind)).toEqual(['error_log', 'app', 'app'])
    expect(mocks.queryDb).not.toHaveBeenCalled()
    expect(stdout).not.toHaveBeenCalled()
  })

  it('routes access/activity/info/debug to stdout in all mode regardless of storage flags', async () => {
    vi.stubEnv('LOG_CONSOLE', 'all')
    const logging = await load({ enabled: false, access_log_enabled: false, activity_log_enabled: false, debug_enabled: true, debug_override_prod: true, log_level: 'debug' })
    logging.logAccess({ ...access, ip: '127.0.0.1', query_params: { token: 'secret' } })
    logging.logActivity(activity)
    logging.info('info', { password: 'secret' })
    logging.debug('debug')
    logging.warn('warn')
    logging.error('error')
    expect(lines(stdout).map(line => [line.kind, line.level])).toEqual([['access_log', 'info'], ['activity_log', 'info'], ['app', 'info'], ['app', 'debug']])
    expect(lines(stdout)[0]).toMatchObject({ msg: 'GET /test 200', request_id: 'request-123', status: 200, duration_ms: 12, ua: 'test-browser', ip: '127.0.0.1', ctx: { query_params: { token: '[REDACTED]' } } })
    expect(lines(stdout)[1]!.msg).toBe('Test activity')
    expect(lines(stdout)[2]!.ctx.password).toBe('[REDACTED]')
    expect(lines(stderr).map(line => line.level)).toEqual(['warn', 'error'])
    expect(mocks.queryDb).not.toHaveBeenCalled()
    expect(mocks.appendAccessLog).not.toHaveBeenCalled()
  })

  it('always skips health probes in console/storage and the middleware path check', async () => {
    vi.stubEnv('LOG_CONSOLE', 'all')
    const logging = await load({ excluded_paths: [] })
    for (const path of ['/api/health', '/api/health/', '/api/health?db=1']) {
      expect(logging.shouldExcludePath(path)).toBe(true)
      logging.logAccess({ ...access, path })
      logging.logAccess({ ...access, path, status_code: 503 })
    }
    expect(stdout).not.toHaveBeenCalled()
    expect(mocks.appendAccessLog).not.toHaveBeenCalled()
    expect(logging.shouldExcludePath('/api/healthz')).toBe(false)
  })

  it('excludes the extended default prefixes from middleware, console, and access storage', async () => {
    vi.stubEnv('LOG_CONSOLE', 'all')
    const logging = await load()
    for (const path of [
      '/api/analytics/track', '/_ipx/w_100/media/image', '/__nuxt_error?statusCode=500',
      '/_i18n/hash/en/messages.json'
    ]) {
      expect(logging.shouldExcludePath(path)).toBe(true)
      logging.logAccess({ ...access, path })
    }
    expect(stdout).not.toHaveBeenCalled()
    expect(mocks.appendAccessLog).not.toHaveBeenCalled()
    expect(mocks.queryDb).not.toHaveBeenCalled()
    // Keep real API requests observable, including ones without IP/user agent.
    logging.logAccess({ ...access, path: '/api/posts', ip: undefined, user_agent: undefined })
    expect(stdout).toHaveBeenCalledTimes(1)
    expect(mocks.appendAccessLog).toHaveBeenCalledTimes(1)
  })

  it('honors filters, sampling, log_level and debug flags', async () => {
    vi.stubEnv('LOG_CONSOLE', 'all')
    const logging = await load({ log_level: 'warn', debug_enabled: false, excluded_paths: ['/private'], excluded_status_codes: [204] })
    logging.logAccess({ ...access, path: '/private/test' })
    logging.logAccess({ ...access, status_code: 204 })
    logging.info('hidden')
    logging.debug('hidden')
    expect(stdout).not.toHaveBeenCalled()
    logging.logAccess(access)
    expect(stdout).toHaveBeenCalledTimes(1)
    await logging.updateLoggingSettings({ sampling_rate: 0 })
    logging.logAccess(access)
    expect(stdout).toHaveBeenCalledTimes(1)
    expect(mocks.appendAccessLog).toHaveBeenCalledTimes(1)
  })

  it('upgrades errors to all when the admin toggle changes, without restarting', async () => {
    const logging = await load()
    logging.logAccess(access)
    expect(stdout).not.toHaveBeenCalled()
    await logging.updateLoggingSettings({ console_output: true })
    logging.logAccess(access)
    logging.logActivity({ action: 'test.action', resource_type: 'test' })
    expect(lines(stdout).map(line => line.kind)).toEqual(['access_log', 'activity_log'])
    expect(lines(stdout)[1]!.msg).toBe('test.action')
    await logging.updateLoggingSettings({ console_output: false })
    logging.logAccess(access)
    expect(stdout).toHaveBeenCalledTimes(2)
  })

  it('hard-off silences all subsystem entries even if the DB toggle is on', async () => {
    vi.stubEnv('LOG_CONSOLE', 'off')
    const logging = await load({ console_output: true, debug_enabled: true, debug_override_prod: true, log_level: 'debug' })
    logging.logAccess(access)
    logging.logActivity(activity)
    logging.logError(new Error('oops'))
    logging.debug('debug')
    logging.info('info')
    logging.warn('warn')
    logging.error('error')
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).not.toHaveBeenCalled()
    expect(mocks.appendAccessLog).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(mocks.queryDb).toHaveBeenCalledTimes(2)
  })

  it.each(['build', 'runtime-logs', 'runtime-access'])('skips both access sinks when the %s module flag is disabled', async (mode) => {
    vi.stubEnv('LOG_CONSOLE', 'all')
    if (mode === 'build') vi.stubGlobal('__PB_MODULE_LOGS__', false)
    else vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: { logs: mode === 'runtime-logs' ? { enabled: false } : { accessLogs: false } } } }))
    const logging = await load()
    logging.logAccess(access)
    expect(mocks.appendAccessLog).not.toHaveBeenCalled()
    expect(stdout).not.toHaveBeenCalled()
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it.each([{ enabled: false }, { access_log_enabled: false }])('does not write access files with storage switch %j', async (settings) => {
    const logging = await load(settings)
    logging.logAccess(access)
    expect(mocks.appendAccessLog).not.toHaveBeenCalled()
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it('routes sanitized access entries to files without DB writes or buffering', async () => {
    const logging = await load({ max_metadata_size_kb: 1, redact_fields: ['token', 'ip', 'referrer'] })
    const query: Record<string, unknown> = { token: 'secret', count: 5n }
    query.self = query
    logging.logAccess({ ...access, timestamp: '2026-10-04T12:00:00Z', ip: 'private', referrer: 'private', query_params: query })
    expect(mocks.appendAccessLog).toHaveBeenCalledExactlyOnceWith({
      ...access, timestamp: '2026-10-04T12:00:00.000Z', ip: '[REDACTED]', referrer: '[REDACTED]',
      query_params: { token: '[REDACTED]', count: '5', self: '[Circular]' }
    })
    logging.logAccess({ ...access, query_params: { token: 'secret', text: 'x'.repeat(3000) } })
    const stored = mocks.appendAccessLog.mock.calls[1]?.[0].query_params
    expect(stored._truncated).toBe(true)
    expect(stored._preview).not.toContain('secret')
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it('routes DB failure diagnostics through the sink and continues printing errors', async () => {
    const logging = await load()
    mocks.queryDb.mockRejectedValue(new Error('DB unavailable'))
    logging.logError(new Error('first'))
    await new Promise(resolve => setTimeout(resolve, 0))
    logging.logError(new Error('second'))
    expect(lines(stderr).map(line => line.kind)).toEqual(['error_log', 'app', 'error_log'])
    expect(lines(stderr)[1]).toMatchObject({ level: 'warn', msg: expect.stringContaining('DB write failed') })
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
  })

  it('does not throw when a console write fails', async () => {
    const logging = await load()
    stderr.mockImplementation(() => { throw new Error('closed stream') })
    expect(() => logging.logError(new Error('oops'))).not.toThrow()
  })

  it('handles circular/BigInt metadata for both console and stored payloads', async () => {
    vi.stubEnv('LOG_CONSOLE', 'all')
    const logging = await load()
    const metadata: Record<string, unknown> = { password: 'secret', count: 5n }
    metadata.self = metadata
    expect(() => logging.logActivity({ ...activity, metadata })).not.toThrow()
    expect(lines(stdout)[0]!.ctx.metadata).toEqual({ password: '[REDACTED]', count: '5', self: '[Circular]' })
    await Promise.resolve()
    expect(mocks.queryDb.mock.calls[0]?.[2].entry.metadata).toEqual({ password: '[REDACTED]', count: '5', self: '[Circular]' })
  })
})
