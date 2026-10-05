import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { queryDb, queryDbRecord, useDb } from './db'
import { appendAccessLog, maintainAccessLogFiles, purgeAccessLogFiles } from './access-log-store'
import { accessStats, readAccessLogById } from './access-log-reader'
import { deleteLogsKeepLatest, deleteLogsOlderThan, purgeLogTable } from './log-retention'
import { applySettingsPatch, extractErrorContext, isHealthCheckPath, redactDeep, resolveErrorStatus, shouldAllowDebug, shouldCaptureHookError, shouldRecordAccessLog } from './logging-logic'
import { sanitizeLogContext, writeConsoleEntry } from './log-console'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from './surrealResult'
import type { AccessLogEntry, ActivityLogEntry, CleanupResult, ErrorLogEntry, LogCleanupMode, LogCleanupType, LogLevel, LoggingSettings } from '~/types/logging'
import { DEFAULT_LOGGING_EXCLUDED_PATHS } from '~/utils/loggingSettings'
import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'

const APP_SETTINGS_TABLE = 'app_settings'
const LOGGING_SETTINGS_KEY = 'logging'
const CIRCUIT_BREAKER_MS = 60_000
const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
}

let dbWritesBlockedUntil = 0
let cacheInitialized = false
let settingsCache: LoggingSettings = defaultLoggingSettings()

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  debug_enabled: z.boolean().optional(),
  debug_override_prod: z.boolean().optional(),
  access_log_enabled: z.boolean().optional(),
  activity_log_enabled: z.boolean().optional(),
  error_log_enabled: z.boolean().optional(),
  error_log_min_status: z.number().int().min(400).max(599).optional(),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  excluded_paths: z.array(z.string().min(1)).max(200).optional(),
  excluded_status_codes: z.array(z.number().int().min(100).max(599)).max(200).optional(),
  redact_fields: z.array(z.string().min(1)).max(500).optional(),
  retention_access_days: z.number().int().min(1).max(3650).optional(),
  retention_activity_days: z.number().int().min(1).max(3650).optional(),
  retention_error_days: z.number().int().min(1).max(3650).optional(),
  max_metadata_size_kb: z.number().int().min(1).max(1024).optional(),
  sampling_rate: z.number().min(0).max(1).optional(),
  console_output: z.boolean().optional()
}).strict()

export function defaultLoggingSettings(): LoggingSettings {
  return {
    enabled: true,
    debug_enabled: false,
    debug_override_prod: false,
    access_log_enabled: true,
    activity_log_enabled: true,
    error_log_enabled: true,
    error_log_min_status: 500,
    log_level: 'info',
    excluded_paths: [...DEFAULT_LOGGING_EXCLUDED_PATHS],
    excluded_status_codes: [],
    redact_fields: ['password', 'token', 'authorization', 'cookie'],
    retention_access_days: 30,
    retention_activity_days: 365,
    retention_error_days: 90,
    max_metadata_size_kb: 50,
    sampling_rate: 1,
    console_output: false,
    updated_at: new Date().toISOString()
  }
}

export function validateLoggingSettingsUpdate(payload: unknown) {
  const parsed = updateSchema.safeParse(payload)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Invalid settings payload' })
  }

  return parsed.data
}

export function getLoggingSettings() {
  return settingsCache
}

export function isDebugEnabled() {
  return shouldAllowDebug({ ...settingsCache, enabled: true })
}

export function shouldLogLevel(level: LogLevel) {
  return levelPriority[level] >= levelPriority[settingsCache.log_level]
}

export function shouldExcludePath(pathname: string) {
  return isHealthCheckPath(pathname) || settingsCache.excluded_paths.some(prefix => pathname.startsWith(prefix))
}

export function shouldExcludeStatusCode(statusCode: number) {
  return settingsCache.excluded_status_codes.includes(statusCode)
}

export function shouldRedact(fieldName: string) {
  const lowered = fieldName.toLowerCase()
  return settingsCache.redact_fields.some((field) => field.toLowerCase() === lowered)
}

export async function initializeLoggingSettings() {
  if (cacheInitialized) {
    return settingsCache
  }

  try {
    const db = await useDb()
    const response = await queryDb<[Array<Record<string, unknown>>]>(
      db,
      'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
      { key: LOGGING_SETTINGS_KEY },
      { label: 'logging settings init', timeoutMs: 10_000 }
    )

    const current = firstRow<Record<string, unknown>>(response)
    const value = current?.value
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      const defaults = defaultLoggingSettings()
      applySettings(await persistLoggingSettings(defaults))
    } else {
      applySettings(normalizeSettingsRecord({
        ...(value as Record<string, unknown>),
        updated_at: current.updated_at
      }))
    }
  } catch (error) {
    settingsCache = defaultLoggingSettings()
    if (!cacheInitialized) {
      const message = error instanceof Error ? error.message : 'unknown error'
      warn(`[logging] failed to load settings from DB, falling back to defaults (${message})`)
    }
  }

  cacheInitialized = true
  return settingsCache
}

export async function reloadLoggingSettings() {
  cacheInitialized = false
  return initializeLoggingSettings()
}

export async function updateLoggingSettings(partial: unknown) {
  const safePartial = validateLoggingSettingsUpdate(partial)
  const merged = applySettingsPatch(settingsCache, safePartial)

  applySettings(await persistLoggingSettings(merged))
  return settingsCache
}

export async function resetLoggingSettings() {
  const defaults = defaultLoggingSettings()
  applySettings(await persistLoggingSettings(defaults))
  return settingsCache
}

export function buildRequestId() {
  return randomUUID()
}

export function debug(message: string, data?: Record<string, unknown>) {
  if (!isDebugEnabled() || !shouldLogLevel('debug')) {
    return
  }

  writeConsoleEntry({ level: 'debug', kind: 'app', msg: message, ctx: data }, settingsCache)
}

export function info(message: string, data?: Record<string, unknown>) {
  if (!shouldLogLevel('info')) {
    return
  }

  writeConsoleEntry({ level: 'info', kind: 'app', msg: message, ctx: data }, settingsCache)
}

export function warn(message: string, data?: Record<string, unknown>) {
  writeConsoleEntry({ level: 'warn', kind: 'app', msg: message, ctx: data }, settingsCache)
}

export function error(message: string, data?: Record<string, unknown>) {
  writeConsoleEntry({ level: 'error', kind: 'app', msg: message, ctx: data }, settingsCache)
}

export function logAccess(entry: AccessLogEntry) {
  if (!__PB_MODULE_LOGS__ || !resolveModuleFlags(getRuntimeModuleConfig()).accessLogs) return
  const settings = settingsCache
  // Filters and sampling apply to both sinks; enable switches control storage only.
  if (!shouldRecordAccessLog(entry.path, entry.status_code, { ...settings, enabled: true, access_log_enabled: true })) {
    return
  }

  const payload = {
    ...entry,
    timestamp: loggingTimestamp(entry.timestamp).toISOString(),
    query_params: sanitizeAndTrim(entry.query_params ?? {}) as Record<string, unknown>
  }
  writeConsoleEntry({
    ts: payload.timestamp,
    level: 'info',
    kind: 'access_log',
    msg: `${entry.method} ${entry.path} ${entry.status_code}`,
    request_id: entry.request_id,
    method: entry.method,
    path: entry.path,
    status: entry.status_code,
    duration_ms: entry.response_time_ms,
    ip: entry.ip,
    ua: entry.user_agent,
    ctx: { query_params: entry.query_params, referrer: entry.referrer }
  }, settings)
  if (!settings.enabled || !settings.access_log_enabled) {
    return
  }
  // Keep the full-field redaction semantics of the console sink before mapping
  // to short file keys. New entries never enter the legacy DB buffer.
  appendAccessLog(redactDeep(payload, settings.redact_fields) as AccessLogEntry)
}

export function logActivity(entry: ActivityLogEntry) {
  const settings = settingsCache
  const payload = {
    ...entry,
    timestamp: loggingTimestamp(entry.timestamp),
    metadata: sanitizeAndTrim(entry.metadata ?? {})
  }
  writeConsoleEntry({
    ts: payload.timestamp,
    level: 'info',
    kind: 'activity_log',
    msg: entry.description ?? entry.action,
    request_id: entry.request_id,
    ip: entry.ip,
    ctx: { action: entry.action, resource_type: entry.resource_type, resource_id: entry.resource_id, metadata: entry.metadata }
  }, settings)
  if (!settings.enabled || !settings.activity_log_enabled) {
    return
  }
  const dbPayload = compactLogPayload(payload)
  fireAndForgetDbWrite(async () => {
    const db = await useDb()
    await queryDb(
      db,
      'CREATE activity_logs CONTENT $entry;',
      { entry: dbPayload },
      { label: 'log activity write', timeoutMs: 5_000, retryOnReconnect: false }
    )
  })
}

export function logError(err: unknown, context?: Record<string, unknown>) {
  const settings = settingsCache
  const statusCode = resolveErrorStatus(err, context?.status_code)
  // Only automatic Nitro capture is filtered. Explicit application logs remain visible.
  if (context?.source === 'nitro.error_hook' && !shouldCaptureHookError(statusCode, settings.error_log_min_status)) {
    return
  }

  const errorValue = normalizeError(err)
  const errorContext: Record<string, unknown> = { ...context, ...extractErrorContext(err) }
  const payload = {
    timestamp: new Date(),
    level: errorValue.level,
    message: errorValue.message,
    stack: errorValue.stack,
    status_code: statusCode,
    request_id: context?.request_id ? String(context.request_id) : null,
    path: context?.path ? String(context.path) : null,
    method: context?.method ? String(context.method) : null,
    context: sanitizeAndTrim(errorContext) as Record<string, unknown>
  }
  const { request_id, path, method, status_code: _statusCode, ...consoleContext } = errorContext
  writeConsoleEntry({
    ts: payload.timestamp,
    level: 'error',
    kind: 'error_log',
    msg: errorValue.message,
    request_id: request_id != null ? String(request_id) : undefined,
    method: method != null ? String(method) : undefined,
    path: path != null ? String(path) : undefined,
    status: statusCode,
    err,
    ctx: consoleContext
  }, settings)
  if (!settings.enabled || !settings.error_log_enabled) {
    return
  }
  const dbPayload = compactLogPayload(payload)
  fireAndForgetDbWrite(async () => {
    const db = await useDb()
    await queryDb(
      db,
      'CREATE error_logs CONTENT $entry;',
      { entry: dbPayload },
      { label: 'log error write', timeoutMs: 5_000, retryOnReconnect: false }
    )
  })
}

export async function runManualLogCleanup(options: { type: LogCleanupType, mode: LogCleanupMode, value: number }) {
  if (options.type === 'access' && options.mode === 'keep_latest') {
    throw createError({ statusCode: 400, statusMessage: 'keep_latest is not supported for access log files; use older_than_days instead' })
  }
  const deleted = options.type === 'access'
    ? (await maintainAccessLogFiles(new Date(), options.value)).deleted
    : options.mode === 'older_than_days'
      ? await deleteLogsOlderThan(typeToTable(options.type), new Date(Date.now() - options.value * 86_400_000))
      : await deleteLogsKeepLatest(typeToTable(options.type), options.value)

  const result: CleanupResult = {
    type: options.type,
    mode: options.mode,
    value: options.value,
    deleted
  }

  logActivity({
    action: 'system.log_cleanup',
    resource_type: 'logging',
    resource_id: options.type,
    metadata: {
      ...result
    },
    description: `Manual log cleanup completed (${deleted} ${options.type === 'access' ? 'files' : 'rows'} deleted)`
  })

  return result
}

export async function gatherLogStats() {
  const flags = resolveModuleFlags(getRuntimeModuleConfig())
  const access = flags.logs && flags.accessLogs
    ? await accessStats()
    : { count: 0, oldest: null, newest: null, bytes: 0, files: 0 }
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT count() AS total, math::min(timestamp) AS oldest, math::max(timestamp) AS newest FROM activity_logs GROUP ALL;
     SELECT count() AS total, math::min(timestamp) AS oldest, math::max(timestamp) AS newest FROM error_logs GROUP ALL;`,
    undefined,
    { label: 'log stats', timeoutMs: 10_000 }
  )

  const activity = firstRow<{ total?: number, oldest?: string, newest?: string }>(response, 0)
  const errors = firstRow<{ total?: number, oldest?: string, newest?: string }>(response, 1)
  const estimate =
    Number(activity?.total ?? 0) * 900 +
    Number(errors?.total ?? 0) * 1200

  return {
    access,
    activity: {
      count: Number(activity?.total ?? 0),
      oldest: activity?.oldest ?? null,
      newest: activity?.newest ?? null
    },
    errors: {
      count: Number(errors?.total ?? 0),
      oldest: errors?.oldest ?? null,
      newest: errors?.newest ?? null
    },
    db_estimate_bytes: estimate,
    access_files_bytes: access.bytes
  }
}

export async function purgeLogType(type: 'access' | 'activity' | 'errors') {
  if (type === 'access') return purgeAccessLogFiles()
  return purgeLogTable(typeToTable(type))
}

export async function readLogById(type: 'access' | 'activity' | 'errors', id: string) {
  if (type === 'access') return readAccessLogById(id)
  const table = typeToTable(type)
  const db = await useDb()
  return await queryDbRecord(db, table, id.includes(':') ? stringifyRecordId(id) : id, {
    label: `read ${type} log detail`,
    timeoutMs: 10_000
  })
}

export async function setErrorLogsReadState(ids: string[], read: boolean) {
  const uniqueIds = normalizeErrorLogIds(ids)
  if (!uniqueIds.length) {
    return []
  }

  const params: Record<string, unknown> = {}
  const statements = uniqueIds.map((id, index) => {
    const idParam = `id_${index}`
    params[idParam] = id
    return read
      ? `UPDATE type::record('error_logs', $${idParam}) SET read_at = time::now() RETURN AFTER;`
      : `UPDATE type::record('error_logs', $${idParam}) UNSET read_at RETURN AFTER;`
  })

  const db = await useDb()
  const response = await queryDb(db, statements.join('\n'), params, {
    label: read ? 'mark error logs read' : 'mark error logs unread',
    timeoutMs: 20_000
  })

  return flattenMutatedLogIds(response)
}

export async function deleteErrorLogsByIds(ids: string[]) {
  const uniqueIds = normalizeErrorLogIds(ids)
  if (!uniqueIds.length) {
    return []
  }

  const params: Record<string, unknown> = {}
  const statements = uniqueIds.map((id, index) => {
    const idParam = `id_${index}`
    params[idParam] = id
    return `DELETE type::record('error_logs', $${idParam}) RETURN BEFORE;`
  })

  const db = await useDb()
  const response = await queryDb(db, statements.join('\n'), params, {
    label: 'delete selected error logs',
    timeoutMs: 20_000
  })

  return flattenMutatedLogIds(response)
}

function normalizeErrorLogIds(ids: string[]) {
  return Array.from(new Set(ids
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map(id => recordIdPart(id, 'error_logs'))
    .filter(Boolean)
  )).slice(0, 200)
}

function flattenMutatedLogIds(response: unknown) {
  if (!Array.isArray(response)) {
    return queryRows<Record<string, unknown>>(response).map(row => stringifyRecordId(row.id))
  }

  return response.flatMap((_, index) => queryRows<Record<string, unknown>>(response, index).map(row => stringifyRecordId(row.id)))
}

function applySettings(next: LoggingSettings) {
  settingsCache = { ...next }
  cacheInitialized = true
}

async function persistLoggingSettings(settings: LoggingSettings): Promise<LoggingSettings> {
  const db = await useDb()
  const next = {
    ...settings,
    updated_at: new Date().toISOString()
  }

  await queryDb(db, `DELETE FROM app_settings WHERE key = $key AND id != type::record($table, $id);`, {
    table: APP_SETTINGS_TABLE,
    id: LOGGING_SETTINGS_KEY,
    key: LOGGING_SETTINGS_KEY
  }, { label: 'logging settings duplicate cleanup', timeoutMs: 10_000 })

  await queryDb(
    db,
    `UPSERT type::record($table, $id) CONTENT {
      key: $key,
      value: $value,
      updated_at: time::now()
    };`,
    {
      table: APP_SETTINGS_TABLE,
      id: LOGGING_SETTINGS_KEY,
      key: LOGGING_SETTINGS_KEY,
      value: next
    },
    { label: 'logging settings persist', timeoutMs: 10_000 }
  )

  return next
}

function normalizeSettingsRecord(record: Record<string, unknown>): LoggingSettings {
  const defaults = defaultLoggingSettings()
  const normalized: LoggingSettings = {
    enabled: asBoolean(record.enabled, defaults.enabled),
    debug_enabled: asBoolean(record.debug_enabled, defaults.debug_enabled),
    debug_override_prod: asBoolean(record.debug_override_prod, defaults.debug_override_prod),
    access_log_enabled: asBoolean(record.access_log_enabled, defaults.access_log_enabled),
    activity_log_enabled: asBoolean(record.activity_log_enabled, defaults.activity_log_enabled),
    error_log_enabled: asBoolean(record.error_log_enabled, defaults.error_log_enabled),
    error_log_min_status: asErrorLogMinStatus(record.error_log_min_status, defaults.error_log_min_status),
    log_level: asLogLevel(record.log_level, defaults.log_level),
    excluded_paths: asStringArray(record.excluded_paths, defaults.excluded_paths),
    excluded_status_codes: asNumberArray(record.excluded_status_codes, defaults.excluded_status_codes),
    redact_fields: asStringArray(record.redact_fields, defaults.redact_fields),
    retention_access_days: asPositiveInt(record.retention_access_days, defaults.retention_access_days),
    retention_activity_days: asPositiveInt(record.retention_activity_days, defaults.retention_activity_days),
    retention_error_days: asPositiveInt(record.retention_error_days, defaults.retention_error_days),
    max_metadata_size_kb: asPositiveInt(record.max_metadata_size_kb, defaults.max_metadata_size_kb),
    sampling_rate: asSamplingRate(record.sampling_rate, defaults.sampling_rate),
    console_output: asBoolean(record.console_output, defaults.console_output),
    updated_at: asUpdatedAt(record.updated_at)
  }

  return normalized
}

function asUpdatedAt(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return new Date().toISOString()
}

function fireAndForgetDbWrite(task: () => Promise<void>) {
  if (Date.now() < dbWritesBlockedUntil) {
    return
  }

  task().catch((error) => {
    dbWritesBlockedUntil = Date.now() + CIRCUIT_BREAKER_MS
    const message = error instanceof Error ? error.message : 'unknown error'
    warn(`[logging] DB write failed; disabling DB writes for 60s (${message})`)
  })
}

function sanitizeAndTrim(input: unknown) {
  return sanitizeLogContext(input, settingsCache)
}

function loggingTimestamp(value?: string) {
  if (!value) {
    return new Date()
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function compactLogPayload(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== null && value !== undefined)
  )
}

function normalizeError(err: unknown) {
  if (err instanceof Error) {
    return {
      level: 'error' as LogLevel,
      message: err.message,
      stack: err.stack ?? null
    }
  }

  return {
    level: 'error' as LogLevel,
    message: typeof err === 'string' ? err : 'Unknown error',
    stack: null
  }
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function asLogLevel(value: unknown, fallback: LogLevel): LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error' ? value : fallback
}

function asStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : fallback
}

function asNumberArray(value: unknown, fallback: number[]) {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === 'number' && Number.isInteger(entry))
    : fallback
}

function asErrorLogMinStatus(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599 ? value : fallback
}

function asPositiveInt(value: unknown, fallback: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return fallback
  }

  return value
}

function asSamplingRate(value: unknown, fallback: number) {
  if (typeof value !== 'number' || value < 0 || value > 1) {
    return fallback
  }

  return value
}

function typeToTable(type: Exclude<LogCleanupType, 'access'>) {
  if (type === 'activity') {
    return 'activity_logs'
  }

  return 'error_logs'
}
