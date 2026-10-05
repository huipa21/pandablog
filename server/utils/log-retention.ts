import { queryDb, useDb } from './db'
import { firstRow } from './surrealResult'
import { retainErrorGroups } from './error-groups'
import { maintainAccessLogFiles } from './access-log-store'
import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'
import type { RetentionReport } from '~/types/logging'

export type { RetentionReport } from '~/types/logging'
export const LOG_RETENTION_SCHEDULE = '17 3 * * *'
export const ACCESS_LOG_MAINTENANCE_SCHEDULE = '5 0 * * *'

let running: Promise<RetentionReport> | null = null
let lastReport: RetentionReport | null = null

export function getLastRetentionReport(): RetentionReport | null {
  return lastReport ? copyReport(lastReport) : null
}

// Deliberately not an async wrapper: concurrent callers receive the same promise.
export function runLogRetention(now = new Date()): Promise<RetentionReport> {
  if (!running) {
    running = performLogRetention(now).finally(() => { running = null })
  }
  return running
}

function copyReport(report: RetentionReport): RetentionReport {
  return { ...report, deleted: { ...report.deleted }, errors: [...report.errors] }
}

function describeFailure(error: unknown) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
}

async function performLogRetention(now: Date): Promise<RetentionReport> {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('Invalid retention run date')
  }
  const cutoffTime = now.getTime()
  const started = Date.now()
  const report: RetentionReport = {
    started_at: new Date(started).toISOString(),
    finished_at: new Date(started).toISOString(),
    duration_ms: 0,
    deleted: { access: 0, access_files: 0, activity: 0, errors: 0 },
    errors: []
  }
  const complete = () => {
    report.finished_at = new Date().toISOString()
    report.duration_ms = Math.max(0, Date.now() - started)
    lastReport = copyReport(report)
    return report
  }
  if (!__PB_MODULE_LOGS__) {
    return complete()
  }
  const flags = resolveModuleFlags(getRuntimeModuleConfig())
  if (!flags.logs) {
    return complete()
  }
  // logging.ts imports the deletion helpers; defer this import to avoid an
  // eager settings/logger dependency cycle when those helpers are loaded.
  const { initializeLoggingSettings, getLoggingSettings, logActivity, warn } = await import('./logging')
  try {
    await initializeLoggingSettings()
    const settings = { ...getLoggingSettings() }
    if (settings.enabled) {
      if (flags.accessLogs && settings.access_log_enabled) {
        try {
          report.deleted.access_files = (await maintainAccessLogFiles(now, settings.retention_access_days)).deleted
        } catch (error) {
          report.errors.push(`access_files: ${describeFailure(error)}`)
        }
      }
      const streams = [
        { key: 'activity', table: 'activity_logs', enabled: flags.activityLogs && settings.activity_log_enabled, days: settings.retention_activity_days },
        { key: 'errors', table: 'error_logs', enabled: flags.errorLogs && settings.error_log_enabled, days: settings.retention_error_days }
      ] as const
      for (const stream of streams) {
        if (!stream.enabled) continue
        try {
          report.deleted[stream.key] = await deleteLogsOlderThan(stream.table, new Date(cutoffTime - stream.days * 86_400_000))
        } catch (error) {
          report.errors.push(`${stream.key}: ${describeFailure(error)}`)
        }
      }
      if (flags.errorLogs && settings.error_log_enabled) {
        try {
          const trimmed = await retainErrorGroups(new Date(cutoffTime - settings.retention_error_days * 86_400_000), settings.error_occurrences_per_group)
          report.deleted.error_groups = trimmed.groups
          report.deleted.errors += trimmed.occurrences
        } catch (error) {
          report.errors.push(`error_groups: ${describeFailure(error)}`)
        }
      }
    }
  } catch (error) {
    report.errors.push(`settings: ${describeFailure(error)}`)
  }
  report.finished_at = new Date().toISOString()
  report.duration_ms = Math.max(0, Date.now() - started)
  const total = Object.values(report.deleted).reduce((sum, count) => sum + (count ?? 0), 0)
  if (flags.activityLogs && (total > 0 || report.errors.length)) {
    try {
      logActivity({ action: 'system.log_retention', resource_type: 'logging', metadata: { ...report }, description: `Scheduled log retention removed ${total} rows/files` })
    } catch (error) {
      report.errors.push(`audit: ${describeFailure(error)}`)
    }
  }
  if (report.errors.length) {
    warn('[logging] retention completed with errors', { errors: report.errors, deleted: report.deleted })
  }
  lastReport = copyReport(report)
  return report
}

const LOG_TABLES = ['activity_logs', 'error_logs', 'error_groups'] as const
export type LogRetentionTable = typeof LOG_TABLES[number]

export interface LogDeletionOptions {
  batchSize?: number
  pauseMs?: number
  maxBatches?: number
  timeField?: string
}

const DEFAULT_BATCH_SIZE = 2000
const DEFAULT_PAUSE_MS = 50
const DEFAULT_MAX_BATCHES = 10_000
const PURGE_CUTOFF = new Date('9999-12-31T23:59:59.999Z')

function validateTable(table: LogRetentionTable) {
  if (!(LOG_TABLES as readonly string[]).includes(table)) {
    throw new Error('Invalid log retention table')
  }
}

function resolveTimeField(table: LogRetentionTable, field?: string): 'timestamp' | 'last_seen' {
  const timeField = field ?? (table === 'error_groups' ? 'last_seen' : 'timestamp')
  // These are SQL literals, not arbitrary caller-supplied identifiers.
  if (timeField !== 'timestamp' && timeField !== 'last_seen') {
    throw new Error('Invalid log retention time field')
  }
  return timeField
}

function resolveOptions(table: LogRetentionTable, opts: LogDeletionOptions) {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE
  const pauseMs = opts.pauseMs ?? DEFAULT_PAUSE_MS
  const maxBatches = opts.maxBatches ?? DEFAULT_MAX_BATCHES
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error('Log deletion batch size must be a positive integer')
  }
  if (!Number.isFinite(pauseMs) || pauseMs < 0 || pauseMs > 2_147_483_647) {
    throw new Error('Log deletion pause must be a non-negative timer duration')
  }
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 0) {
    throw new Error('Log deletion batch limit must be a non-negative integer')
  }
  return { batchSize, pauseMs, maxBatches, timeField: resolveTimeField(table, opts.timeField) }
}

function deletionCount(response: unknown[], batchSize: number) {
  // LET and DELETE return no row data. RETURN array::len($ids) is the final
  // statement result: [undefined, [], count] in the current SDK. Also accept
  // wrapped statement results used by older adapters.
  const last = response.at(-1)
  const count = last && typeof last === 'object' ? (last as { result?: unknown }).result : last
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > batchSize) {
    throw new Error('Invalid log deletion batch count')
  }
  return count
}

export async function deleteLogsOlderThan(table: LogRetentionTable, cutoff: Date, opts: LogDeletionOptions = {}): Promise<number> {
  validateTable(table)
  const { batchSize, pauseMs, maxBatches, timeField } = resolveOptions(table, opts)
  if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) {
    throw new Error('Invalid log deletion cutoff')
  }
  const cutoffIso = cutoff.toISOString()
  if (maxBatches === 0) {
    return 0
  }
  const db = await useDb()
  let deleted = 0
  for (let batch = 0; batch < maxBatches; batch++) {
    const response = await queryDb(
      db,
      `LET $ids = (SELECT VALUE id FROM type::table($table)
                  WHERE ${timeField} < <datetime>$cutoff
                  ORDER BY ${timeField} ASC LIMIT $batch);
       DELETE $ids RETURN NONE;
       RETURN array::len($ids);`,
      { table, cutoff: cutoffIso, batch: batchSize },
      { label: `retention delete ${table}`, timeoutMs: 30_000, retryOnReconnect: false }
    )
    const count = deletionCount(response, batchSize)
    deleted += count
    if (count < batchSize || batch + 1 === maxBatches) {
      break
    }
    if (pauseMs > 0) {
      await new Promise(resolve => setTimeout(resolve, pauseMs))
    }
  }
  return deleted
}

export async function deleteLogsKeepLatest(table: LogRetentionTable, keep: number): Promise<number> {
  validateTable(table)
  if (!Number.isSafeInteger(keep) || keep < 0) {
    throw new Error('Log keep count must be a non-negative integer')
  }
  if (keep === 0) {
    return purgeLogTable(table)
  }
  const timeField = resolveTimeField(table)
  const db = await useDb()
  const response = await queryDb(
    db,
    // SurrealDB 3.2's indexed datetime ordering can return the wrong cutoff.
    // Force the timestamp sort instead of risking deletion of retained rows.
    `SELECT ${timeField} FROM type::table($table) WITH NOINDEX ORDER BY ${timeField} DESC LIMIT 1 START $offset;`,
    { table, offset: keep - 1 },
    { label: `find ${table} cleanup cutoff`, timeoutMs: 15_000, retryOnReconnect: false }
  )
  const timestamp = firstRow<Record<string, unknown>>(response)?.[timeField]
  if (timestamp == null) {
    return 0
  }
  // SDK datetimes stringify to ISO-8601 but are not JavaScript Date instances.
  const cutoff = timestamp instanceof Date ? timestamp : new Date(String(timestamp))
  // A strict cutoff preserves all rows tied with the Nth newest timestamp.
  return deleteLogsOlderThan(table, cutoff)
}

export async function purgeLogTable(table: LogRetentionTable): Promise<number> {
  validateTable(table)
  const db = await useDb()
  const response = await queryDb(
    db,
    'SELECT count() AS total FROM type::table($table) GROUP ALL;',
    { table },
    { label: `count ${table} for purge`, timeoutMs: 30_000, retryOnReconnect: false }
  )
  const total = firstRow<{ total?: number }>(response)?.total ?? 0
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error('Invalid log purge count')
  }
  if (total === 0) {
    return 0
  }
  // Report the summed batch counts, not the count snapshot (writes/deletes can
  // interleave). No deleted row bodies are ever returned to the application.
  return deleteLogsOlderThan(table, PURGE_CUTOFF)
}
