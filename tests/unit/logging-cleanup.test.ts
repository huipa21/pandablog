import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useDb: vi.fn(), queryDb: vi.fn(),
  deleteLogsOlderThan: vi.fn(), deleteLogsKeepLatest: vi.fn(), purgeLogTable: vi.fn(),
  maintainAccessLogFiles: vi.fn(), purgeAccessLogFiles: vi.fn(), readAccessLogById: vi.fn(), accessStats: vi.fn(), queryDbRecord: vi.fn()
}))
vi.mock('../../server/utils/db', () => mocks)
vi.mock('../../server/utils/log-retention', () => mocks)
vi.mock('../../server/utils/access-log-store', () => ({ ...mocks, appendAccessLog: vi.fn() }))
vi.mock('../../server/utils/access-log-reader', () => mocks)

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: {} } }))
  vi.stubEnv('LOG_CONSOLE', 'off')
  mocks.useDb.mockResolvedValue({})
  mocks.queryDb.mockResolvedValue([])
  mocks.deleteLogsOlderThan.mockResolvedValue(12)
  mocks.deleteLogsKeepLatest.mockResolvedValue(7)
  mocks.purgeLogTable.mockResolvedValue(19)
  mocks.maintainAccessLogFiles.mockResolvedValue({ compressed: 2, deleted: 3 })
  mocks.purgeAccessLogFiles.mockResolvedValue(42)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('manual cleanup routing', () => {
  it.each([['activity', 'activity_logs'], ['errors', 'error_logs']] as const)('keeps %s age cleanup/auditing DB-backed', async (type, table) => {
    vi.useFakeTimers()
    const now = new Date('2026-10-04T10:00:00.000Z')
    vi.setSystemTime(now)
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    const options = { type, mode: 'older_than_days' as const, value: 30 }
    const result = await runManualLogCleanup(options)
    expect(result).toEqual({ ...options, deleted: 12 })
    expect(mocks.deleteLogsOlderThan).toHaveBeenCalledExactlyOnceWith(table, new Date(now.getTime() - 30 * 86_400_000))
    expect(mocks.deleteLogsKeepLatest).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(mocks.queryDb).toHaveBeenCalledWith(expect.anything(), 'CREATE activity_logs CONTENT $entry;', {
      entry: expect.objectContaining({ action: 'system.log_cleanup', resource_type: 'logging', resource_id: type, metadata: result, description: 'Manual log cleanup completed (12 rows deleted)' })
    }, expect.objectContaining({ retryOnReconnect: false }))
  })

  it('cleans access day files and audits physical file counts without touching legacy rows', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-04T10:00:00Z'))
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    const options = { type: 'access' as const, mode: 'older_than_days' as const, value: 30 }
    expect(await runManualLogCleanup(options)).toEqual({ ...options, deleted: 3 })
    expect(mocks.maintainAccessLogFiles).toHaveBeenCalledExactlyOnceWith(new Date(), 30)
    expect(mocks.deleteLogsOlderThan).not.toHaveBeenCalled()
    expect(mocks.deleteLogsKeepLatest).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(mocks.queryDb).toHaveBeenCalledWith(expect.anything(), 'CREATE activity_logs CONTENT $entry;', {
      entry: expect.objectContaining({ description: 'Manual log cleanup completed (3 files deleted)' })
    }, expect.anything())
  })

  it.each([['activity', 'activity_logs'], ['errors', 'error_logs']] as const)('keeps %s keep-latest cleanup DB-backed', async (type, table) => {
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    expect(await runManualLogCleanup({ type, mode: 'keep_latest', value: 100 })).toEqual({ type, mode: 'keep_latest', value: 100, deleted: 7 })
    expect(mocks.deleteLogsKeepLatest).toHaveBeenCalledExactlyOnceWith(table, 100)
    expect(mocks.maintainAccessLogFiles).not.toHaveBeenCalled()
  })

  it('rejects access keep-latest before any I/O or audit', async () => {
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    await expect(runManualLogCleanup({ type: 'access', mode: 'keep_latest', value: 100 })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('older_than_days') })
    expect(mocks.maintainAccessLogFiles).not.toHaveBeenCalled()
    expect(mocks.deleteLogsKeepLatest).not.toHaveBeenCalled()
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it.each(['access', 'errors'] as const)('propagates %s deletion failures without a success audit', async (type) => {
    mocks.deleteLogsOlderThan.mockRejectedValue(new Error('deletion failed'))
    mocks.maintainAccessLogFiles.mockRejectedValue(new Error('deletion failed'))
    const { runManualLogCleanup } = await import('../../server/utils/logging')
    await expect(runManualLogCleanup({ type, mode: 'older_than_days', value: 30 })).rejects.toThrow('deletion failed')
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })
})

describe('purge and detail routing', () => {
  it.each([['activity', 'activity_logs'], ['errors', 'error_logs']] as const)('keeps %s purge/detail DB-backed', async (type, table) => {
    const { purgeLogType, readLogById } = await import('../../server/utils/logging')
    expect(await purgeLogType(type)).toBe(19)
    expect(mocks.purgeLogTable.mock.calls).toEqual(type === 'errors' ? [[table], ['error_groups']] : [[table]])
    await readLogById(type, 'one')
    expect(mocks.queryDbRecord).toHaveBeenCalledWith(expect.anything(), table, 'one', expect.anything())
    expect(mocks.purgeAccessLogFiles).not.toHaveBeenCalled()
    expect(mocks.readAccessLogById).not.toHaveBeenCalled()
  })

  it('uses file purge/detail without DB or legacy-buffer access', async () => {
    mocks.readAccessLogById.mockResolvedValue({ id: '2026-10-04:one' })
    const { purgeLogType, readLogById } = await import('../../server/utils/logging')
    expect(await purgeLogType('access')).toBe(42)
    expect(await readLogById('access', '2026-10-04:one')).toEqual({ id: '2026-10-04:one' })
    expect(mocks.purgeAccessLogFiles).toHaveBeenCalledOnce()
    expect(mocks.readAccessLogById).toHaveBeenCalledExactlyOnceWith('2026-10-04:one')
    expect(mocks.useDb).not.toHaveBeenCalled()
    expect(mocks.purgeLogTable).not.toHaveBeenCalled()
  })

  it.each(['access', 'errors'] as const)('propagates %s purge failures', async (type) => {
    mocks.purgeAccessLogFiles.mockRejectedValue(new Error('purge failed'))
    mocks.purgeLogTable.mockRejectedValue(new Error('purge failed'))
    const { purgeLogType } = await import('../../server/utils/logging')
    await expect(purgeLogType(type)).rejects.toThrow('purge failed')
  })
})

describe('stats', () => {
  it('combines file stats with DB-only activity/error estimates', async () => {
    mocks.accessStats.mockResolvedValue({ count: 500, oldest: '2026-10-01T00:00:00Z', newest: '2026-10-04T00:00:00Z', files: 4, bytes: 1234 })
    mocks.queryDb.mockResolvedValue([[{ total: 2, oldest: 'activity-old', newest: 'activity-new' }], [{ total: 3 }]])
    const { gatherLogStats } = await import('../../server/utils/logging')
    expect(await gatherLogStats()).toEqual({
      access: { count: 500, oldest: '2026-10-01T00:00:00Z', newest: '2026-10-04T00:00:00Z', files: 4, bytes: 1234 },
      activity: { count: 2, oldest: 'activity-old', newest: 'activity-new' },
      errors: { count: 3, groups: 0, unread_groups: 0, oldest: null, newest: null },
      db_estimate_bytes: 5400, access_files_bytes: 1234
    })
    expect(mocks.queryDb.mock.calls[0]![1]).not.toContain('access_logs')
  })

  it('does not read files when the access module is disabled', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: { logs: { accessLogs: false } } } }))
    const { gatherLogStats } = await import('../../server/utils/logging')
    expect((await gatherLogStats()).access).toEqual({ count: 0, oldest: null, newest: null, files: 0, bytes: 0 })
    expect(mocks.accessStats).not.toHaveBeenCalled()
  })
})

describe('bounded selected-error deletion', () => {
  it('retains RETURN BEFORE for at most 200 explicitly selected error IDs', async () => {
    mocks.queryDb.mockResolvedValue([[{ id: 'error_logs:one' }]])
    const { deleteErrorLogsByIds } = await import('../../server/utils/logging')
    const ids = Array.from({ length: 205 }, (_, index) => `error_logs:${index}`)
    expect(await deleteErrorLogsByIds(ids)).toEqual(['error_logs:one'])
    expect(String(mocks.queryDb.mock.calls[0]?.[1]).match(/RETURN BEFORE/g)).toHaveLength(200)
    expect(mocks.purgeLogTable).not.toHaveBeenCalled()
  })
})
