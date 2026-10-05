import { DateTime } from 'surrealdb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteLogsKeepLatest, deleteLogsOlderThan, purgeLogTable } from '../../server/utils/log-retention'
import type { LogDeletionOptions, LogRetentionTable } from '../../server/utils/log-retention'
import type { LoggingSettings } from '../../types/logging'

const mocks = vi.hoisted(() => ({ db: {}, queryDb: vi.fn(), useDb: vi.fn(), maintainAccessLogFiles: vi.fn() }))
const logger = vi.hoisted(() => ({ initializeLoggingSettings: vi.fn(), getLoggingSettings: vi.fn(), logActivity: vi.fn(), warn: vi.fn() }))
vi.mock('../../server/utils/db', () => mocks)
vi.mock('../../server/utils/access-log-store', () => ({ maintainAccessLogFiles: mocks.maintainAccessLogFiles }))
vi.mock('../../server/utils/logging', () => logger)
const groupRetention = vi.hoisted(() => ({ retainErrorGroups: vi.fn() }))
vi.mock('../../server/utils/error-groups', () => groupRetention)

const cutoff = new Date('2026-09-04T00:00:00.000Z')
const batchResult = (count: number) => [undefined, [], count]
const instant = { pauseMs: 0 }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.useDb.mockResolvedValue(mocks.db)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('deleteLogsOlderThan', () => {
  it('sums full batches and stops after a short batch', async () => {
    mocks.queryDb.mockResolvedValueOnce(batchResult(2000)).mockResolvedValueOnce(batchResult(2000)).mockResolvedValueOnce(batchResult(3))
    expect(await deleteLogsOlderThan('activity_logs', cutoff, instant)).toBe(4003)
    expect(mocks.queryDb).toHaveBeenCalledTimes(3)
    expect(mocks.useDb).toHaveBeenCalledTimes(1)
    for (const [db, sql, params, options] of mocks.queryDb.mock.calls) {
      expect(db).toBe(mocks.db)
      expect(sql).toContain('SELECT VALUE id FROM type::table($table)')
      expect(sql).toContain('WHERE timestamp < <datetime>$cutoff')
      expect(sql).toContain('ORDER BY timestamp ASC LIMIT $batch')
      expect(sql).toContain('DELETE $ids RETURN NONE;')
      expect(sql).toContain('RETURN array::len($ids);')
      expect(sql).not.toContain('RETURN BEFORE')
      expect(params).toEqual({ table: 'activity_logs', cutoff: cutoff.toISOString(), batch: 2000 })
      expect(options).toEqual({ label: 'retention delete activity_logs', timeoutMs: 30_000, retryOnReconnect: false })
    }
  })

  it('returns zero for an empty batch', async () => {
    mocks.queryDb.mockResolvedValue(batchResult(0))
    expect(await deleteLogsOlderThan('error_logs', cutoff, instant)).toBe(0)
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
  })

  it('requests another batch after an exactly full final batch', async () => {
    mocks.queryDb.mockResolvedValueOnce(batchResult(2)).mockResolvedValueOnce(batchResult(0))
    expect(await deleteLogsOlderThan('activity_logs', cutoff, { batchSize: 2, pauseMs: 0 })).toBe(2)
    expect(mocks.queryDb).toHaveBeenCalledTimes(2)
  })

  it('respects a custom batch size and maxBatches', async () => {
    mocks.queryDb.mockResolvedValue(batchResult(5))
    expect(await deleteLogsOlderThan('error_logs', cutoff, { batchSize: 5, pauseMs: 0, maxBatches: 2 })).toBe(10)
    expect(mocks.queryDb).toHaveBeenCalledTimes(2)
    expect(mocks.queryDb.mock.calls[0]?.[2].batch).toBe(5)
  })

  it('handles a simulated 600K-row backlog using only bounded scalar results', async () => {
    mocks.queryDb.mockImplementation(async () => batchResult(mocks.queryDb.mock.calls.length <= 300 ? 2000 : 0))
    expect(await deleteLogsOlderThan('activity_logs', cutoff, instant)).toBe(600_000)
    expect(mocks.queryDb).toHaveBeenCalledTimes(301)
  })

  it('defaults to a 10,000-batch safety limit', async () => {
    mocks.queryDb.mockResolvedValue(batchResult(2000))
    expect(await deleteLogsOlderThan('activity_logs', cutoff, instant)).toBe(20_000_000)
    expect(mocks.queryDb).toHaveBeenCalledTimes(10_000)
  })

  it('yields for the default 50ms between full batches, but not after completion', async () => {
    vi.useFakeTimers()
    mocks.queryDb.mockResolvedValueOnce(batchResult(2000)).mockResolvedValueOnce(batchResult(1))
    const deletion = deleteLogsOlderThan('activity_logs', cutoff)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(49)
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await deletion).toBe(2001)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not pause after the batch limit is reached', async () => {
    vi.useFakeTimers()
    mocks.queryDb.mockResolvedValue(batchResult(2000))
    expect(await deleteLogsOlderThan('activity_logs', cutoff, { maxBatches: 1 })).toBe(2000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('supports wrapped scalar statement results', async () => {
    mocks.queryDb.mockResolvedValue([{ result: null }, { result: [] }, { result: 3 }])
    expect(await deleteLogsOlderThan('error_logs', cutoff, instant)).toBe(3)
  })

  it('uses last_seen for error groups and permits a whitelisted override', async () => {
    mocks.queryDb.mockResolvedValue(batchResult(0))
    await deleteLogsOlderThan('error_groups', cutoff, instant)
    expect(mocks.queryDb.mock.calls[0]?.[1]).toContain('WHERE last_seen < <datetime>$cutoff')
    expect(mocks.queryDb.mock.calls[0]?.[1]).toContain('ORDER BY last_seen ASC')
    await deleteLogsOlderThan('error_groups', cutoff, { ...instant, timeField: 'timestamp' })
    expect(mocks.queryDb.mock.calls[1]?.[1]).toContain('WHERE timestamp < <datetime>$cutoff')
  })

  it('does not acquire a DB client when maxBatches is zero', async () => {
    expect(await deleteLogsOlderThan('activity_logs', cutoff, { maxBatches: 0 })).toBe(0)
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it.each([
    { batchSize: 0 }, { batchSize: -1 }, { batchSize: 1.5 }, { batchSize: Number.NaN },
    { pauseMs: -1 }, { pauseMs: Number.POSITIVE_INFINITY }, { pauseMs: 2_147_483_648 },
    { maxBatches: -1 }, { maxBatches: 0.5 }, { maxBatches: Number.NaN },
    { timeField: 'timestamp; DELETE users;' }, { timeField: 'unknown' }
  ] satisfies LogDeletionOptions[])('rejects unsafe/invalid options before connecting (%j)', async (options) => {
    await expect(deleteLogsOlderThan('activity_logs', cutoff, options)).rejects.toThrow()
    expect(mocks.useDb).not.toHaveBeenCalled()
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it('rejects invalid dates before connecting', async () => {
    await expect(deleteLogsOlderThan('activity_logs', new Date('invalid'))).rejects.toThrow('Invalid log deletion cutoff')
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it.each([undefined, null, -1, 2001, 1.5, '3', Number.NaN])('rejects invalid batch counts rather than reporting success (%s)', async (count) => {
    mocks.queryDb.mockResolvedValue(batchResult(count as number))
    await expect(deleteLogsOlderThan('activity_logs', cutoff, instant)).rejects.toThrow('Invalid log deletion batch count')
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
  })

  it('propagates a failing batch without retrying or continuing', async () => {
    mocks.queryDb.mockResolvedValueOnce(batchResult(2000)).mockRejectedValueOnce(new Error('DB unavailable'))
    await expect(deleteLogsOlderThan('activity_logs', cutoff, instant)).rejects.toThrow('DB unavailable')
    expect(mocks.queryDb).toHaveBeenCalledTimes(2)
  })
})

describe('deleteLogsKeepLatest', () => {
  it.each([cutoff, cutoff.toISOString(), new DateTime(cutoff)])('accepts JS/string/SDK datetimes as the Nth-newest cutoff (%s)', async (timestamp) => {
    mocks.queryDb.mockResolvedValueOnce([[{ timestamp }]]).mockResolvedValueOnce(batchResult(4))
    expect(await deleteLogsKeepLatest('activity_logs', 3)).toBe(4)
    expect(mocks.queryDb.mock.calls[0]?.[1]).toBe('SELECT timestamp FROM type::table($table) WITH NOINDEX ORDER BY timestamp DESC LIMIT 1 START $offset;')
    expect(mocks.queryDb.mock.calls[0]?.[2]).toEqual({ table: 'activity_logs', offset: 2 })
    expect(mocks.queryDb.mock.calls[1]?.[2].cutoff).toBe(cutoff.toISOString())
    expect(mocks.queryDb.mock.calls[1]?.[1]).toContain('timestamp < <datetime>$cutoff') // Keeps timestamp ties.
  })

  it('retains the newest row when keep is one', async () => {
    mocks.queryDb.mockResolvedValueOnce([[{ timestamp: cutoff }]]).mockResolvedValueOnce(batchResult(1))
    expect(await deleteLogsKeepLatest('error_logs', 1)).toBe(1)
    expect(mocks.queryDb.mock.calls[0]?.[2].offset).toBe(0)
  })

  it('does nothing when fewer than keep rows exist', async () => {
    mocks.queryDb.mockResolvedValue([[]])
    expect(await deleteLogsKeepLatest('activity_logs', 100)).toBe(0)
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
  })

  it('uses last_seen for error group cutoffs and deletion', async () => {
    mocks.queryDb.mockResolvedValueOnce([[{ last_seen: cutoff }]]).mockResolvedValueOnce(batchResult(2))
    expect(await deleteLogsKeepLatest('error_groups', 1)).toBe(2)
    expect(mocks.queryDb.mock.calls[0]?.[1]).toContain('SELECT last_seen')
    expect(mocks.queryDb.mock.calls[1]?.[1]).toContain('WHERE last_seen <')
  })

  it('purges when keep is zero', async () => {
    mocks.queryDb.mockResolvedValueOnce([[{ total: 2 }]]).mockResolvedValueOnce(batchResult(2))
    expect(await deleteLogsKeepLatest('activity_logs', 0)).toBe(2)
    expect(mocks.queryDb.mock.calls[0]?.[1]).toContain('SELECT count()')
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid keep counts (%s)', async (keep) => {
    await expect(deleteLogsKeepLatest('activity_logs', keep)).rejects.toThrow('Log keep count')
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it('propagates cutoff query failure without deleting', async () => {
    mocks.queryDb.mockRejectedValue(new Error('cutoff failed'))
    await expect(deleteLogsKeepLatest('error_logs', 2)).rejects.toThrow('cutoff failed')
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid stored cutoff without issuing a delete', async () => {
    mocks.queryDb.mockResolvedValue([[{ timestamp: 'invalid' }]])
    await expect(deleteLogsKeepLatest('error_logs', 2)).rejects.toThrow('Invalid log deletion cutoff')
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
  })
})

describe('purgeLogTable', () => {
  it('counts first, deletes in batches, and reports the batch sum rather than a stale snapshot', async () => {
    vi.useFakeTimers()
    mocks.queryDb.mockResolvedValueOnce([[{ total: 2500 }]]).mockResolvedValueOnce(batchResult(2000)).mockResolvedValueOnce(batchResult(501))
    const purge = purgeLogTable('activity_logs')
    await vi.runAllTimersAsync()
    expect(await purge).toBe(2501)
    expect(mocks.queryDb.mock.calls[0]?.[1]).toBe('SELECT count() AS total FROM type::table($table) GROUP ALL;')
    expect(mocks.queryDb.mock.calls[0]?.[2]).toEqual({ table: 'activity_logs' })
    expect(mocks.queryDb.mock.calls[0]?.[3]).toMatchObject({ timeoutMs: 30_000, retryOnReconnect: false })
    expect(mocks.queryDb.mock.calls[1]?.[2].cutoff).toBe('9999-12-31T23:59:59.999Z')
    expect(mocks.queryDb).toHaveBeenCalledTimes(3)
  })

  it.each([{ response: [[]] }, { response: [[{ total: 0 }]] }])('skips deletion for an empty table (%j)', async ({ response }) => {
    mocks.queryDb.mockResolvedValue(response)
    expect(await purgeLogTable('error_logs')).toBe(0)
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
  })

  it('propagates a count query failure without deleting', async () => {
    mocks.queryDb.mockRejectedValue(new Error('count failed'))
    await expect(purgeLogTable('error_logs')).rejects.toThrow('count failed')
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid count snapshots without deleting', async () => {
    mocks.queryDb.mockResolvedValue([[{ total: -1 }]])
    await expect(purgeLogTable('error_logs')).rejects.toThrow('Invalid log purge count')
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
  })
})

function runnerSettings(): LoggingSettings {
  return {
    enabled: true, debug_enabled: false, debug_override_prod: false,
    access_log_enabled: true, activity_log_enabled: true, error_log_enabled: true, error_log_min_status: 500, error_occurrences_per_group: 50,
    log_level: 'info', excluded_paths: [], excluded_status_codes: [], redact_fields: [],
    retention_access_days: 2, retention_activity_days: 3, retention_error_days: 4,
    max_metadata_size_kb: 50, sampling_rate: 1, console_output: false
  }
}

describe('retention runner', () => {
  const now = new Date('2026-10-04T10:00:00.000Z')
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    vi.stubGlobal('__PB_MODULE_LOGS__', true)
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: {} } }))
    logger.initializeLoggingSettings.mockResolvedValue(runnerSettings())
    logger.getLoggingSettings.mockReturnValue(runnerSettings())
    groupRetention.retainErrorGroups.mockResolvedValue({ groups: 0, occurrences: 0 })
    mocks.maintainAccessLogFiles.mockResolvedValue({ compressed: 0, deleted: 0 })
    mocks.queryDb.mockResolvedValue(batchResult(0))
  })

  it('maintains access files with saved settings, never deletes access DB rows, and audits non-empty runs', async () => {
    mocks.maintainAccessLogFiles.mockResolvedValue({ compressed: 1, deleted: 1 })
    mocks.queryDb.mockResolvedValueOnce(batchResult(2)).mockResolvedValueOnce(batchResult(3))
    const retention = await import('../../server/utils/log-retention')
    expect(retention.getLastRetentionReport()).toBeNull()
    const report = await retention.runLogRetention(now)
    expect(logger.initializeLoggingSettings).toHaveBeenCalledTimes(1)
    expect(mocks.queryDb.mock.calls.map(call => call[2])).toEqual([
      { table: 'activity_logs', cutoff: new Date(now.getTime() - 3 * 86_400_000).toISOString(), batch: 2000 },
      { table: 'error_logs', cutoff: new Date(now.getTime() - 4 * 86_400_000).toISOString(), batch: 2000 }
    ])
    expect(mocks.maintainAccessLogFiles).toHaveBeenCalledExactlyOnceWith(now, 2)
    expect(report).toEqual({ started_at: now.toISOString(), finished_at: now.toISOString(), duration_ms: 0, deleted: { access: 0, access_files: 1, activity: 2, errors: 3, error_groups: 0 }, errors: [] })
    expect(logger.logActivity).toHaveBeenCalledExactlyOnceWith({ action: 'system.log_retention', resource_type: 'logging', metadata: report, description: 'Scheduled log retention removed 6 rows/files' })
    expect(logger.warn).not.toHaveBeenCalled()
    expect(retention.getLastRetentionReport()).toEqual(report)
  })

  it('adds group/occurrence trimming to the report without losing the age count', async () => {
    groupRetention.retainErrorGroups.mockResolvedValue({ groups: 2, occurrences: 80 })
    mocks.queryDb.mockResolvedValueOnce(batchResult(0)).mockResolvedValueOnce(batchResult(5))
    const { runLogRetention } = await import('../../server/utils/log-retention')
    const report = await runLogRetention(now)
    expect(groupRetention.retainErrorGroups).toHaveBeenCalledWith(new Date(now.getTime() - 4 * 86_400_000), 50)
    expect(report.deleted).toMatchObject({ errors: 85, error_groups: 2 })
  })

  it('isolates group retention failures from other streams', async () => {
    groupRetention.retainErrorGroups.mockRejectedValue(new Error('cap failed'))
    const { runLogRetention } = await import('../../server/utils/log-retention')
    expect((await runLogRetention(now)).errors).toEqual(['error_groups: cap failed'])
  })

  it('records elapsed wall-clock time independently of the cutoff anchor', async () => {
    mocks.queryDb.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 5)
      return batchResult(0)
    })
    const { runLogRetention } = await import('../../server/utils/log-retention')
    const report = await runLogRetention(new Date('2025-01-01T00:00:00Z'))
    expect(report.duration_ms).toBe(10)
    expect(report.finished_at).toBe(new Date(now.getTime() + 10).toISOString())
    expect(mocks.maintainAccessLogFiles).toHaveBeenCalledWith(new Date('2025-01-01T00:00:00Z'), 2)
    expect(mocks.queryDb.mock.calls[0]?.[2].cutoff).toBe('2024-12-29T00:00:00.000Z')
  })

  it('does not audit empty successful runs', async () => {
    const { runLogRetention } = await import('../../server/utils/log-retention')
    expect((await runLogRetention()).deleted).toEqual({ access: 0, access_files: 0, activity: 0, errors: 0, error_groups: 0 })
    expect(logger.logActivity).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('does not count compression as deletion or audit a compression-only pass', async () => {
    mocks.maintainAccessLogFiles.mockResolvedValue({ compressed: 5, deleted: 0 })
    const { runLogRetention } = await import('../../server/utils/log-retention')
    expect((await runLogRetention()).deleted.access_files).toBe(0)
    expect(logger.logActivity).not.toHaveBeenCalled()
  })

  it('skips every stream when the settings master switch is disabled', async () => {
    logger.getLoggingSettings.mockReturnValue({ ...runnerSettings(), enabled: false })
    const { runLogRetention } = await import('../../server/utils/log-retention')
    await runLogRetention()
    expect(mocks.queryDb).not.toHaveBeenCalled()
    expect(mocks.maintainAccessLogFiles).not.toHaveBeenCalled()
    expect(logger.logActivity).not.toHaveBeenCalled()
  })

  it.each([
    ['access_log_enabled', 'access_logs'], ['activity_log_enabled', 'activity_logs'], ['error_log_enabled', 'error_logs']
  ] as const)('skips the stream disabled by setting %s', async (setting, table) => {
    logger.getLoggingSettings.mockReturnValue({ ...runnerSettings(), [setting]: false })
    const { runLogRetention } = await import('../../server/utils/log-retention')
    await runLogRetention()
    expect(mocks.queryDb.mock.calls.map(call => call[2].table)).not.toContain(table)
    expect(mocks.queryDb).toHaveBeenCalledTimes(setting === 'access_log_enabled' ? 2 : 1)
    expect(mocks.maintainAccessLogFiles).toHaveBeenCalledTimes(setting === 'access_log_enabled' ? 0 : 1)
  })

  it.each([
    ['accessLogs', 'access_logs'], ['activityLogs', 'activity_logs'], ['errorLogs', 'error_logs']
  ] as const)('skips the stream disabled by module flag %s', async (flag, table) => {
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: { logs: { [flag]: false } } } }))
    const { runLogRetention } = await import('../../server/utils/log-retention')
    await runLogRetention()
    expect(mocks.queryDb.mock.calls.map(call => call[2].table)).not.toContain(table)
    expect(mocks.queryDb).toHaveBeenCalledTimes(flag === 'accessLogs' ? 2 : 1)
    expect(mocks.maintainAccessLogFiles).toHaveBeenCalledTimes(flag === 'accessLogs' ? 0 : 1)
  })

  it.each(['build', 'runtime'])('is a no-op before settings/DB access when %s logging is disabled', async (mode) => {
    if (mode === 'build') vi.stubGlobal('__PB_MODULE_LOGS__', false)
    else vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: { logs: { enabled: false } } } }))
    const { runLogRetention } = await import('../../server/utils/log-retention')
    expect((await runLogRetention()).errors).toEqual([])
    expect(logger.initializeLoggingSettings).not.toHaveBeenCalled()
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it('continues the other streams after one fails and reports/audits the error', async () => {
    mocks.queryDb.mockRejectedValueOnce(new Error('DB unavailable')).mockResolvedValueOnce(batchResult(3))
    const { runLogRetention } = await import('../../server/utils/log-retention')
    const report = await runLogRetention()
    expect(report.deleted).toEqual({ access: 0, access_files: 0, activity: 0, errors: 3, error_groups: 0 })
    expect(report.errors).toEqual(['activity: DB unavailable'])
    expect(logger.logActivity).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith('[logging] retention completed with errors', { errors: report.errors, deleted: report.deleted })
  })

  it('reports file maintenance failures but cleans the DB streams', async () => {
    mocks.maintainAccessLogFiles.mockRejectedValue(new Error('disk failed'))
    const { runLogRetention } = await import('../../server/utils/log-retention')
    const report = await runLogRetention()
    expect(report.errors).toEqual(['access_files: disk failed'])
    expect(mocks.queryDb.mock.calls.map(call => call[2].table)).toEqual(['activity_logs', 'error_logs'])
    expect(logger.logActivity).toHaveBeenCalledTimes(1) // Errors alone warrant an audit.
  })

  it('reports settings initialization failures without deleting and warns even when activity is off', async () => {
    logger.initializeLoggingSettings.mockRejectedValue(new Error('settings unavailable'))
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: { logs: { activityLogs: false } } } }))
    const { runLogRetention } = await import('../../server/utils/log-retention')
    expect((await runLogRetention()).errors).toEqual(['settings: settings unavailable'])
    expect(mocks.queryDb).not.toHaveBeenCalled()
    expect(logger.logActivity).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('does not emit an activity entry when the activity module is disabled', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: { logs: { activityLogs: false } } } }))
    mocks.queryDb.mockResolvedValue(batchResult(1))
    const { runLogRetention } = await import('../../server/utils/log-retention')
    await runLogRetention()
    expect(logger.logActivity).not.toHaveBeenCalled()
  })

  it('shares the exact in-flight promise and permits a new run after completion', async () => {
    let resolveSettings!: () => void
    logger.initializeLoggingSettings.mockImplementationOnce(() => new Promise<void>(resolve => { resolveSettings = resolve }))
    const { runLogRetention } = await import('../../server/utils/log-retention')
    const first = runLogRetention(now)
    const second = runLogRetention(new Date('2000-01-01T00:00:00Z'))
    expect(second).toBe(first)
    await vi.waitFor(() => expect(logger.initializeLoggingSettings).toHaveBeenCalledTimes(1))
    resolveSettings()
    expect(await first).toBe(await second)
    expect(mocks.maintainAccessLogFiles).toHaveBeenCalledExactlyOnceWith(now, 2)
    expect(mocks.queryDb).toHaveBeenCalledTimes(2)
    const third = runLogRetention(now)
    expect(third).not.toBe(first)
    await third
    expect(mocks.queryDb).toHaveBeenCalledTimes(4)
    expect(mocks.maintainAccessLogFiles).toHaveBeenCalledTimes(2)
  })

  it('clears single-flight state after rejection and protects the cached report from mutation', async () => {
    const retention = await import('../../server/utils/log-retention')
    await expect(retention.runLogRetention(new Date('invalid'))).rejects.toThrow('Invalid retention run date')
    const report = await retention.runLogRetention()
    const snapshot = retention.getLastRetentionReport()!
    snapshot.deleted.access = 99
    snapshot.errors.push('mutated')
    report.deleted.activity = 88
    expect(retention.getLastRetentionReport()?.deleted).toEqual({ access: 0, access_files: 0, activity: 0, errors: 0, error_groups: 0 })
    expect(retention.getLastRetentionReport()?.errors).toEqual([])
  })
})

describe('table allowlist', () => {
  it.each(['posts', '', 'access_logs', 'access_logs; DELETE users;'])('rejects table %s in every helper before DB access', async (table) => {
    const unsafe = table as LogRetentionTable
    await expect(deleteLogsOlderThan(unsafe, cutoff)).rejects.toThrow('Invalid log retention table')
    await expect(deleteLogsKeepLatest(unsafe, 1)).rejects.toThrow('Invalid log retention table')
    await expect(purgeLogTable(unsafe)).rejects.toThrow('Invalid log retention table')
    expect(mocks.useDb).not.toHaveBeenCalled()
  })
})
