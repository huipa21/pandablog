import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { queryDb, queryDbRecord, useDb } from './db'
import { applySettingsPatch, redactDeep, shouldAllowDebug, shouldRecordAccessLog, trimByMaxSize } from './logging-logic'
import { firstRow, queryRows, stringifyRecordId } from './surrealResult'
import type { AccessLogEntry, ActivityLogEntry, CleanupResult, ErrorLogEntry, LogCleanupMode, LogCleanupType, LogLevel, LoggingSettings } from '~/types/logging'

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
    log_level: 'info',
    excluded_paths: ['/_nuxt', '/favicon', '/api/admin/logs'],
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
  return shouldAllowDebug(settingsCache)
}

export function shouldLogLevel(level: LogLevel) {
  if (!settingsCache.enabled) {
    return false
  }

  return levelPriority[level] >= levelPriority[settingsCache.log_level]
}

export function shouldExcludePath(pathname: string) {
  return settingsCache.excluded_paths.some(prefix => pathname.startsWith(prefix))
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
      console.warn(`[logging] failed to load settings from DB, falling back to defaults (${message})`)
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

  mirrorConsole('debug', message, data)
}

export function info(message: string, data?: Record<string, unknown>) {
  if (!shouldLogLevel('info')) {
    return
  }

  mirrorConsole('info', message, data)
}

export function warn(message: string, data?: Record<string, unknown>) {
  if (!shouldLogLevel('warn')) {
    return
  }

  mirrorConsole('warn', message, data)
}

export function error(message: string, data?: Record<string, unknown>) {
  if (!shouldLogLevel('error')) {
    return
  }

  mirrorConsole('error', message, data)
}

export function logAccess(entry: AccessLogEntry) {
  const settings = settingsCache
  if (!shouldRecordAccessLog(entry.path, entry.status_code, settings)) {
    return
  }

  const payload = {
    ...entry,
    timestamp: loggingTimestamp(entry.timestamp),
    query_params: sanitizeAndTrim(entry.query_params ?? {})
  }
  const dbPayload = compactLogPayload(payload)

  mirrorConsole('info', 'access_log', payload)
  fireAndForgetDbWrite(async () => {
    const db = await useDb()
    await queryDb(
      db,
      'CREATE access_logs CONTENT $entry;',
      { entry: dbPayload },
      { label: 'log access write', timeoutMs: 5_000, retryOnReconnect: false }
    )
  })
}

export function logActivity(entry: ActivityLogEntry) {
  const settings = settingsCache
  if (!settings.enabled || !settings.activity_log_enabled) {
    return
  }

  const payload = {
    ...entry,
    timestamp: loggingTimestamp(entry.timestamp),
    metadata: sanitizeAndTrim(entry.metadata ?? {})
  }
  const dbPayload = compactLogPayload(payload)

  mirrorConsole('info', 'activity_log', payload)
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
  if (!settings.enabled || !settings.error_log_enabled) {
    return
  }

  const errorValue = normalizeError(err)
  const payload = {
    timestamp: new Date(),
    level: errorValue.level,
    message: errorValue.message,
    stack: errorValue.stack,
    request_id: context?.request_id ? String(context.request_id) : null,
    path: context?.path ? String(context.path) : null,
    method: context?.method ? String(context.method) : null,
    context: sanitizeAndTrim(context ?? {}) as Record<string, unknown>
  }
  const dbPayload = compactLogPayload(payload)

  mirrorConsole('error', 'error_log', payload)
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
  const table = typeToTable(options.type)
  const db = await useDb()
  const deleted = options.mode === 'older_than_days'
    ? await deleteOlderThan(db, table, new Date(Date.now() - options.value * 86_400_000))
    : await deleteBeyondLatest(db, table, options.value)

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
    description: `Manual log cleanup completed (${deleted} rows deleted)`
  })

  return result
}

export async function gatherLogStats() {
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT count() AS total, math::min(timestamp) AS oldest, math::max(timestamp) AS newest FROM access_logs GROUP ALL;
     SELECT count() AS total, math::min(timestamp) AS oldest, math::max(timestamp) AS newest FROM activity_logs GROUP ALL;
     SELECT count() AS total, math::min(timestamp) AS oldest, math::max(timestamp) AS newest FROM error_logs GROUP ALL;`,
    undefined,
    { label: 'log stats', timeoutMs: 10_000 }
  )

  const access = firstRow<{ total?: number, oldest?: string, newest?: string }>(response, 0)
  const activity = firstRow<{ total?: number, oldest?: string, newest?: string }>(response, 1)
  const errors = firstRow<{ total?: number, oldest?: string, newest?: string }>(response, 2)
  const estimate =
    Number(access?.total ?? 0) * 700 +
    Number(activity?.total ?? 0) * 900 +
    Number(errors?.total ?? 0) * 1200

  return {
    access: {
      count: Number(access?.total ?? 0),
      oldest: access?.oldest ?? null,
      newest: access?.newest ?? null
    },
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
    estimate_bytes: estimate
  }
}

export async function purgeLogType(type: 'access' | 'activity' | 'errors') {
  const table = typeToTable(type)
  const db = await useDb()
  const response = await queryDb(db, `DELETE ${table} RETURN BEFORE;`, undefined, {
    label: `purge ${type} logs`,
    timeoutMs: 20_000
  })

  return queryRows<Record<string, unknown>>(response).length
}

export async function readLogById(type: 'access' | 'activity' | 'errors', id: string) {
  const table = typeToTable(type)
  const db = await useDb()
  return await queryDbRecord(db, table, id.includes(':') ? stringifyRecordId(id) : id, {
    label: `read ${type} log detail`,
    timeoutMs: 10_000
  })
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
    console.warn(`[logging] DB write failed; disabling DB writes for 60s (${message})`)
  })
}

function sanitizeAndTrim(input: unknown) {
  const redacted = redactDeep(input, settingsCache.redact_fields)
  return trimByMaxSize(redacted, settingsCache.max_metadata_size_kb)
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

function mirrorConsole(level: LogLevel, message: string, data?: Record<string, unknown>) {
  if (!settingsCache.console_output) {
    return
  }

  const fn = level === 'debug' ? console.debug
    : level === 'info' ? console.info
    : level === 'warn' ? console.warn
    : console.error

  if (data && Object.keys(data).length > 0) {
    fn(`[logging] ${message}`, data)
  } else {
    fn(`[logging] ${message}`)
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

async function deleteOlderThan(db: Awaited<ReturnType<typeof useDb>>, table: string, cutoff: Date | string) {
  const response = await queryDb(
    db,
    `DELETE ${table} WHERE timestamp < <datetime>$cutoff RETURN BEFORE;`,
    { cutoff: cutoff instanceof Date ? cutoff.toISOString() : cutoff },
    { label: `cleanup ${table}`, timeoutMs: 30_000 }
  )

  return queryRows<Record<string, unknown>>(response).length
}

async function deleteBeyondLatest(db: Awaited<ReturnType<typeof useDb>>, table: string, keepLatest: number) {
  const cutoffResponse = await queryDb(
    db,
    `SELECT timestamp FROM ${table} ORDER BY timestamp DESC LIMIT 1 START $keepLatest;`,
    { keepLatest },
    { label: `find ${table} cleanup cutoff`, timeoutMs: 15_000 }
  )
  const cutoff = firstRow<{ timestamp?: string | Date }>(cutoffResponse)?.timestamp

  if (!cutoff) {
    return 0
  }

  return await deleteOlderThan(db, table, cutoff)
}

function typeToTable(type: LogCleanupType) {
  if (type === 'access') {
    return 'access_logs'
  }

  if (type === 'activity') {
    return 'activity_logs'
  }

  return 'error_logs'
}
