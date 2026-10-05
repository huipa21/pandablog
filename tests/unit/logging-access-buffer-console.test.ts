import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appendFile: vi.fn(), mkdir: vi.fn(), readFile: vi.fn(), rename: vi.fn(), rm: vi.fn(),
  queryDb: vi.fn(), useDb: vi.fn()
}))
vi.mock('node:fs/promises', () => mocks)
vi.mock('../../server/utils/db', () => mocks)

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubEnv('LOG_CONSOLE', 'errors')
  vi.stubEnv('LOG_FORMAT', 'json')
  mocks.mkdir.mockResolvedValue(undefined)
  mocks.rm.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('access buffer console diagnostics', () => {
  it.each(['errors', 'off'])('append failures respect LOG_CONSOLE=%s', async (mode) => {
    vi.stubEnv('LOG_CONSOLE', mode)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.appendFile.mockRejectedValue(new Error('disk unavailable'))
    // Allow the append chain to settle by awaiting a flush with no buffer to claim.
    mocks.rename.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    const buffer = await import('../../server/utils/logging-access-buffer')
    buffer.bufferAccessLog({ timestamp: new Date(), method: 'GET' })
    await buffer.flushAccessBuffer()
    expect(warn).not.toHaveBeenCalled()
    if (mode === 'off') {
      expect(stderr).not.toHaveBeenCalled()
    } else {
      expect(stderr).toHaveBeenCalledTimes(1)
      expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({ level: 'warn', kind: 'app', msg: expect.stringContaining('access buffer append failed') })
    }
  })

  it('flush failures print a structured warning on stderr', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    mocks.rename.mockResolvedValue(undefined)
    mocks.readFile.mockResolvedValue('{"method":"GET"}\n')
    mocks.useDb.mockRejectedValue(new Error('DB unavailable'))
    const buffer = await import('../../server/utils/logging-access-buffer')
    expect(await buffer.flushAccessBuffer()).toBe(0)
    expect(stderr).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({ level: 'warn', kind: 'app', msg: expect.stringContaining('access buffer flush failed after 0 rows') })
  })
})
