import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

const mocks = vi.hoisted(() => ({ queryDb: vi.fn(), useDb: vi.fn().mockResolvedValue({}) }))
vi.mock('../../server/utils/db', () => ({ ...mocks, queryDbRecord: vi.fn() }))
const activity = { action: 'test.action', resource_type: 'test', description: 'Test activity' }
let stdout: MockInstance<typeof process.stdout.write>
let stderr: MockInstance<typeof process.stderr.write>
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  vi.stubGlobal('__PB_MODULE_LOGS__', true)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: {} } }))
  vi.stubEnv('LOG_CONSOLE', 'errors'); vi.stubEnv('LOG_FORMAT', 'json')
  stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function load(settings: Record<string, unknown> = {}) {
  mocks.queryDb.mockResolvedValue([[{ value: settings }]])
  const logging = await import('../../server/utils/logging')
  await logging.initializeLoggingSettings(); mocks.queryDb.mockClear()
  return logging
}
function lines(spy: typeof stdout): Array<Record<string, any>> {
  return spy.mock.calls.map(call => JSON.parse(String(call[0])))
}

describe('retained application/activity/error console routing', () => {
  it('does not inherit private boot/restore authority for detached ordinary DB logging', async () => {
    const logging = await load()
    const { writeBarrier } = await import('../../server/utils/maintenance')
    const owner = {}; await writeBarrier.close(owner)
    await writeBarrier.runOwner(owner, async () => {
      logging.logActivity(activity); logging.logError(new Error('fixture boot diagnostic'))
      await logging.flushPendingErrorGroups(); await Promise.resolve(); await Promise.resolve()
      expect(mocks.queryDb).not.toHaveBeenCalled()
    })
  })
  it('defaults to one error line on stderr, with stack and request id', async () => {
    const logging = await load(), err = new TypeError('oops')
    logging.logError(err, { request_id: 'request-123', path: '/api/test', method: 'POST', source: 'nitro.error_hook' })
    logging.logActivity(activity); logging.info('hidden')
    expect(stdout).not.toHaveBeenCalled(); expect(stderr).toHaveBeenCalledTimes(1)
    expect(lines(stderr)[0]).toMatchObject({ level: 'error', kind: 'error_log', msg: 'oops', request_id: 'request-123', path: '/api/test', method: 'POST', err: { name: 'TypeError', message: 'oops', stack: err.stack }, ctx: { source: 'nitro.error_hook' } })
  })
  it('prints errors/warnings even with storage disabled and restrictive log_level', async () => {
    const logging = await load({ enabled: false, error_log_enabled: false, log_level: 'error' })
    logging.logError(new Error('oops')); logging.warn('warning'); logging.error('helper error')
    expect(lines(stderr).map(line => line.kind)).toEqual(['error_log', 'app', 'app'])
    expect(mocks.queryDb).not.toHaveBeenCalled(); expect(stdout).not.toHaveBeenCalled()
  })
  it('routes activity/info/debug in all mode regardless of storage flags, without an access sink', async () => {
    vi.stubEnv('LOG_CONSOLE', 'all')
    const logging = await load({ enabled: false, activity_log_enabled: false, debug_enabled: true, debug_override_prod: true, log_level: 'debug' })
    expect(logging).not.toHaveProperty('logAccess')
    logging.logActivity(activity); logging.info('info', { password: 'secret' }); logging.debug('debug'); logging.warn('warn'); logging.error('error')
    expect(lines(stdout).map(line => [line.kind, line.level])).toEqual([['activity_log', 'info'], ['app', 'info'], ['app', 'debug']])
    expect(lines(stdout)[0]!.msg).toBe('Test activity')
    expect(lines(stdout)[1]!.ctx.password).toBe('[REDACTED]')
    expect(lines(stderr).map(line => line.level)).toEqual(['warn', 'error'])
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })
  it('honors application log_level and debug flags', async () => {
    vi.stubEnv('LOG_CONSOLE', 'all')
    const logging = await load({ log_level: 'warn', debug_enabled: false })
    logging.info('hidden'); logging.debug('hidden')
    expect(stdout).not.toHaveBeenCalled()
  })
  it('upgrades errors to all live when the admin toggle changes', async () => {
    const logging = await load()
    logging.logActivity(activity); expect(stdout).not.toHaveBeenCalled()
    await logging.updateLoggingSettings({ console_output: true })
    logging.logActivity({ action: 'test.action', resource_type: 'test' })
    expect(lines(stdout).map(line => line.kind)).toEqual(['activity_log'])
    expect(lines(stdout)[0]!.msg).toBe('test.action')
    await logging.updateLoggingSettings({ console_output: false })
    logging.logActivity(activity); expect(stdout).toHaveBeenCalledTimes(1)
  })
  it('hard-off silences all subsystem entries without disabling DB storage', async () => {
    vi.stubEnv('LOG_CONSOLE', 'off')
    const logging = await load({ console_output: true, debug_enabled: true, debug_override_prod: true, log_level: 'debug' })
    logging.logActivity(activity); logging.logError(new Error('oops')); logging.debug('debug'); logging.info('info'); logging.warn('warn'); logging.error('error')
    expect(stdout).not.toHaveBeenCalled(); expect(stderr).not.toHaveBeenCalled()
    await Promise.resolve(); expect(mocks.queryDb).toHaveBeenCalledTimes(2)
  })
  it('routes DB failure diagnostics through the sink and keeps printing errors', async () => {
    const logging = await load(); mocks.queryDb.mockRejectedValue(new Error('DB unavailable'))
    logging.logError(new Error('first')); await new Promise(resolve => setTimeout(resolve, 0)); logging.logError(new Error('second'))
    expect(lines(stderr).map(line => line.kind)).toEqual(['error_log', 'app', 'error_log'])
    expect(lines(stderr)[1]).toMatchObject({ level: 'warn', msg: expect.stringContaining('DB write failed') })
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
  })
  it('does not throw on console failure', async () => {
    const logging = await load(); stderr.mockImplementation(() => { throw new Error('closed stream') })
    expect(() => logging.logError(new Error('oops'))).not.toThrow()
  })
  it('handles circular/BigInt metadata for both console and stored payloads', async () => {
    vi.stubEnv('LOG_CONSOLE', 'all'); const logging = await load()
    const metadata: Record<string, unknown> = { password: 'secret', count: 5n }; metadata.self = metadata
    expect(() => logging.logActivity({ ...activity, metadata })).not.toThrow()
    expect(lines(stdout)[0]!.ctx.metadata).toEqual({ password: '[REDACTED]', count: '5', self: '[Circular]' })
    await Promise.resolve()
    expect(mocks.queryDb.mock.calls[0]?.[2].entry.metadata).toEqual({ password: '[REDACTED]', count: '5', self: '[Circular]' })
  })
})
