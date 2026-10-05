import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useDb: vi.fn(), queryDb: vi.fn(), flushAccessBuffer: vi.fn(),
  deleteLogsOlderThan: vi.fn(), deleteLogsKeepLatest: vi.fn(), purgeLogTable: vi.fn()
}))
vi.mock('../../server/utils/db', () => ({ ...mocks, queryDbRecord: vi.fn() }))
vi.mock('../../server/utils/logging-access-buffer', () => ({ flushAccessBuffer: mocks.flushAccessBuffer, bufferAccessLog: vi.fn() }))
vi.mock('../../server/utils/log-retention', () => mocks)

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubEnv('LOG_CONSOLE', 'off')
  vi.stubEnv('LOG_FORMAT', 'json')
  mocks.useDb.mockResolvedValue({})
  mocks.queryDb.mockResolvedValue([])
  mocks.flushAccessBuffer.mockResolvedValue(1)
  mocks.deleteLogsOlderThan.mockResolvedValue(12)
  mocks.deleteLogsKeepLatest.mockResolvedValue(7)
  mocks.purgeLogTable.mockResolvedValue(19)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('manual cleanup routing', () => {
  it.each([
    ['access', 'access_logs'], ['activity', 'activity_logs'], ['errors', 'error_logs']
  ] as const)('routes %s age cleanup and preserves the response/audit entry', async (type, table) => {
    vi.useFakeTimers()
    const now = new Date('2026-10-04T10:00:00.000Z')
    vi.setSystemTime(now)
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    const options = { type, mode: 'older_than_days' as const, value: 30 }
    const result = await runManualLogCleanup(options)
    expect(result).toEqual({ ...options, deleted: 12 })
    expect(mocks.deleteLogsOlderThan).toHaveBeenCalledExactlyOnceWith(table, new Date(now.getTime() - 30 * 86_400_000))
    expect(mocks.deleteLogsKeepLatest).not.toHaveBeenCalled()
    if (type === 'access') {
      expect(mocks.flushAccessBuffer).toHaveBeenCalledTimes(1)
      expect(mocks.flushAccessBuffer.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteLogsOlderThan.mock.invocationCallOrder[0]!)
    } else {
      expect(mocks.flushAccessBuffer).not.toHaveBeenCalled()
    }
    await Promise.resolve()
    expect(mocks.queryDb).toHaveBeenCalledWith(expect.anything(), 'CREATE activity_logs CONTENT $entry;', {
      entry: expect.objectContaining({ action: 'system.log_cleanup', resource_type: 'logging', resource_id: type, metadata: result, description: 'Manual log cleanup completed (12 rows deleted)' })
    }, expect.objectContaining({ retryOnReconnect: false }))
  })

  it.each([
    ['access', 'access_logs'], ['activity', 'activity_logs'], ['errors', 'error_logs']
  ] as const)('routes %s keep-latest cleanup to the batched helper', async (type, table) => {
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    expect(await runManualLogCleanup({ type, mode: 'keep_latest', value: 100 })).toEqual({ type, mode: 'keep_latest', value: 100, deleted: 7 })
    expect(mocks.deleteLogsKeepLatest).toHaveBeenCalledExactlyOnceWith(table, 100)
    expect(mocks.deleteLogsOlderThan).not.toHaveBeenCalled()
  })

  it('waits for buffered access rows before starting deletion', async () => {
    let resolveFlush!: () => void
    mocks.flushAccessBuffer.mockReturnValue(new Promise<void>(resolve => { resolveFlush = resolve }))
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    const cleanup = runManualLogCleanup({ type: 'access', mode: 'keep_latest', value: 100 })
    await Promise.resolve()
    expect(mocks.deleteLogsKeepLatest).not.toHaveBeenCalled()
    resolveFlush()
    await cleanup
    expect(mocks.deleteLogsKeepLatest).toHaveBeenCalledTimes(1)
  })

  it('does not delete when the access-buffer flush fails', async () => {
    mocks.flushAccessBuffer.mockRejectedValue(new Error('flush failed'))
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    await expect(runManualLogCleanup({ type: 'access', mode: 'older_than_days', value: 30 })).rejects.toThrow('flush failed')
    expect(mocks.deleteLogsOlderThan).not.toHaveBeenCalled()
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it('propagates deletion failures without writing a success activity', async () => {
    mocks.deleteLogsOlderThan.mockRejectedValue(new Error('deletion failed'))
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    await expect(runManualLogCleanup({ type: 'errors', mode: 'older_than_days', value: 30 })).rejects.toThrow('deletion failed')
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })
})

describe('purge routing', () => {
  it.each([
    ['access', 'access_logs'], ['activity', 'activity_logs'], ['errors', 'error_logs']
  ] as const)('routes %s purge and returns the summed count', async (type, table) => {
    const { purgeLogType } = await import('../../server/utils/logging')
    expect(await purgeLogType(type)).toBe(19)
    expect(mocks.purgeLogTable).toHaveBeenCalledExactlyOnceWith(table)
    expect(mocks.queryDb).not.toHaveBeenCalled()
    if (type === 'access') {
      expect(mocks.flushAccessBuffer).toHaveBeenCalledTimes(1)
      expect(mocks.flushAccessBuffer.mock.invocationCallOrder[0]).toBeLessThan(mocks.purgeLogTable.mock.invocationCallOrder[0]!)
    } else {
      expect(mocks.flushAccessBuffer).not.toHaveBeenCalled()
    }
  })

  it('does not purge when the access-buffer flush fails', async () => {
    mocks.flushAccessBuffer.mockRejectedValue(new Error('flush failed'))
    const { purgeLogType } = await import('../../server/utils/logging')
    await expect(purgeLogType('access')).rejects.toThrow('flush failed')
    expect(mocks.purgeLogTable).not.toHaveBeenCalled()
  })

  it('propagates purge failures instead of returning a success count', async () => {
    mocks.purgeLogTable.mockRejectedValue(new Error('purge failed'))
    const { purgeLogType } = await import('../../server/utils/logging')
    await expect(purgeLogType('errors')).rejects.toThrow('purge failed')
  })
})

describe('bounded selected-error deletion', () => {
  it('retains RETURN BEFORE for at most 200 explicitly selected error IDs', async () => {
    mocks.queryDb.mockResolvedValue([[{ id: 'error_logs:one' }]])
    const { deleteErrorLogsByIds } = await import('../../server/utils/logging')
    const ids = Array.from({ length: 205 }, (_, index) => `error_logs:${index}`)
    expect(await deleteErrorLogsByIds(ids)).toEqual(['error_logs:one'])
    const sql = String(mocks.queryDb.mock.calls[0]?.[1])
    expect(sql.match(/RETURN BEFORE/g)).toHaveLength(200)
    expect(mocks.purgeLogTable).not.toHaveBeenCalled()
  })
})
