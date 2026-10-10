import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ useDb: vi.fn(), queryDb: vi.fn(), queryDbRecord: vi.fn(), deleteLogsOlderThan: vi.fn(), deleteLogsKeepLatest: vi.fn(), purgeLogTable: vi.fn() }))
vi.mock('../../server/utils/db', () => mocks)
vi.mock('../../server/utils/log-retention', () => mocks)
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  vi.stubGlobal('createError', createError); vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: {} } }))
  vi.stubEnv('LOG_CONSOLE', 'off')
  mocks.useDb.mockResolvedValue({}); mocks.queryDb.mockResolvedValue([])
  mocks.deleteLogsOlderThan.mockResolvedValue(12); mocks.deleteLogsKeepLatest.mockResolvedValue(7); mocks.purgeLogTable.mockResolvedValue(19)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('retained DB cleanup routing', () => {
  it.each([['activity', 'activity_logs'], ['errors', 'error_logs']] as const)('keeps %s age cleanup/auditing DB-backed', async (type, table) => {
    vi.useFakeTimers(); const now = new Date('2026-10-04T10:00:00.000Z'); vi.setSystemTime(now)
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    const options = { type, mode: 'older_than_days' as const, value: 30 }
    const result = await runManualLogCleanup(options)
    expect(result).toEqual({ ...options, deleted: 12 })
    expect(mocks.deleteLogsOlderThan).toHaveBeenCalledExactlyOnceWith(table, new Date(now.getTime() - 30 * 86_400_000))
    expect(mocks.deleteLogsKeepLatest).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(mocks.queryDb).toHaveBeenCalledWith(expect.anything(), 'CREATE activity_logs CONTENT $entry;', { entry: expect.objectContaining({ action: 'system.log_cleanup', resource_type: 'logging', resource_id: type, metadata: result, description: 'Manual log cleanup completed (12 rows deleted)' }) }, expect.objectContaining({ retryOnReconnect: false }))
  })
  it.each([['activity', 'activity_logs'], ['errors', 'error_logs']] as const)('keeps %s keep-latest cleanup DB-backed', async (type, table) => {
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    expect(await runManualLogCleanup({ type, mode: 'keep_latest', value: 100 })).toEqual({ type, mode: 'keep_latest', value: 100, deleted: 7 })
    expect(mocks.deleteLogsKeepLatest).toHaveBeenCalledExactlyOnceWith(table, 100)
  })
  it.each(['older_than_days', 'keep_latest'] as const)('rejects retired access %s even from an untyped internal caller', async mode => {
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    await expect(runManualLogCleanup({ type: 'access', mode, value: 100 } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.useDb).not.toHaveBeenCalled(); expect(mocks.deleteLogsOlderThan).not.toHaveBeenCalled(); expect(mocks.deleteLogsKeepLatest).not.toHaveBeenCalled()
  })
  it('propagates deletion failures without a success audit', async () => {
    mocks.deleteLogsOlderThan.mockRejectedValue(new Error('deletion failed'))
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    await expect(runManualLogCleanup({ type: 'errors', mode: 'older_than_days', value: 30 })).rejects.toThrow('deletion failed')
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })
})
describe('purge/detail/stats routing', () => {
  it.each([['activity', 'activity_logs'], ['errors', 'error_logs']] as const)('keeps %s purge/detail DB-backed', async (type, table) => {
    const { purgeLogType, readLogById } = await import('../../server/utils/logging')
    expect(await purgeLogType(type)).toBe(19)
    expect(mocks.purgeLogTable.mock.calls).toEqual(type === 'errors' ? [[table], ['error_groups']] : [[table]])
    await readLogById(type, 'one')
    expect(mocks.queryDbRecord).toHaveBeenCalledWith(expect.anything(), table, 'one', expect.anything())
  })
  it('propagates purge failures', async () => {
    mocks.purgeLogTable.mockRejectedValue(new Error('purge failed'))
    const { purgeLogType } = await import('../../server/utils/logging')
    await expect(purgeLogType('errors')).rejects.toThrow('purge failed')
  })
  it('returns DB-only stats and estimates without access queries/zero placeholders', async () => {
    mocks.queryDb.mockResolvedValue([[{ total: 2, oldest: 'activity-old', newest: 'activity-new' }], [{ total: 3 }]])
    const { gatherLogStats } = await import('../../server/utils/logging')
    expect(await gatherLogStats()).toEqual({ activity: { count: 2, oldest: 'activity-old', newest: 'activity-new' }, errors: { count: 3, groups: 0, unread_groups: 0, oldest: null, newest: null }, db_estimate_bytes: 5400 })
    expect(mocks.queryDb.mock.calls[0]![1]).not.toContain('access_logs')
  })
})
describe('bounded selected-error deletion', () => {
  it('retains RETURN BEFORE for at most 200 explicitly selected error IDs', async () => {
    mocks.queryDb.mockResolvedValue([[{ id: 'error_logs:one' }]])
    const { deleteErrorLogsByIds } = await import('../../server/utils/logging')
    expect(await deleteErrorLogsByIds(Array.from({ length: 205 }, (_, index) => `error_logs:${index}`))).toEqual(['error_logs:one'])
    expect(String(mocks.queryDb.mock.calls[0]?.[1]).match(/RETURN BEFORE/g)).toHaveLength(200)
    expect(mocks.purgeLogTable).not.toHaveBeenCalled()
  })
})
