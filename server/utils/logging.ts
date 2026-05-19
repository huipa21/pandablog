import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { queryDb, useDb } from './db'
import { applySettingsPatch, redactDeep, shouldAllowDebug, shouldRecordAccessLog, trimByMaxSize } from './logging-logic'
import { firstRow, queryRows, stringifyRecordId } from './surrealResult'
import type { AccessLogEntry, ActivityLogEntry, CleanupResult, ErrorLogEntry, LogLevel, LoggingSettings } from '~/types/logging'

const LOGGING_SETTINGS_ID = 'current'
const LOGGING_SETTINGS_RECORD = 'logging_settings:current'
const CIRCUIT_BREAKER_MS = 60_000
const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
}

const settingsUpdateListeners = new Set<(settings: LoggingSettings) => void>()
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
  console_output: z.boolean().optional(),
  cleanup_enabled: z.boolean().optional(),
  cleanup_cron: z.string().min(5).max(100).optional()
}).strict()

export function defaultLoggingSettings(appEnv?: string): LoggingSettings {
  const env = appEnv ?? useRuntimeConfig().appEnv
  const isProd = env === 'prod'

  return {
    enabled: true,
    debug_enabled: !isProd,
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
    console_output: !isProd,
    cleanup_enabled: true,
    cleanup_cron: '0 3 * * *',
    updated_at: new Date().toISOString()
  }
}

export function validateLoggingSettingsUpdate(payload: unknown) {
  const parsed = updateSchema.safeParse(payload)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Invalid settings payload' })
  }

  if (parsed.data.cleanup_cron && !isCronExpressionLikelyValid(parsed.data.cleanup_cron)) {
    throw createError({ statusCode: 400, message: 'cleanup_cron must be a valid cron expression' })
  }

  return parsed.data
}

export function getLoggingSettings() {
  return settingsCache
}

export function isDebugEnabled() {
  return shouldAllowDebug(useRuntimeConfig().appEnv, settingsCache)
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

export function onLoggingSettingsUpdated(listener: (settings: LoggingSettings) => void) {
  settingsUpdateListeners.add(listener)
  return () => settingsUpdateListeners.delete(listener)
}

export async function initializeLoggingSettings() {
  if (cacheInitialized) {
    return settingsCache
  }

  try {
    const db = await useDb()
    const response = await queryDb<[Array<Record<string, unknown>>]>(
      db,
      'SELECT * FROM logging_settings WHERE id = type::record($table, $id) LIMIT 1;',
      { table: 'logging_settings', id: LOGGING_SETTINGS_ID },
      { label: 'logging settings init', timeoutMs: 10_000 }
    )

    const current = firstRow<Record<string, unknown>>(response)
    if (!current) {
      const defaults = defaultLoggingSettings()
      await persistLoggingSettings(defaults)
      applySettings(defaults)
    } else {
      applySettings(normalizeSettingsRecord(current))
    }
  } catch (error) {
    settingsCache = defaultLoggingSettings()
    if (!cacheInitialized) {
      console.warn('[logging] failed to load settings from DB, falling back to defaults')
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

  if (!isCronExpressionLikelyValid(merged.cleanup_cron)) {
    throw createError({ statusCode: 400, message: 'cleanup_cron must be a valid cron expression' })
  }

  await persistLoggingSettings(merged)
  applySettings(merged)
  return settingsCache
}

export async function resetLoggingSettings() {
  const defaults = defaultLoggingSettings()
  await persistLoggingSettings(defaults)
  applySettings(defaults)
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
    timestamp: entry.timestamp ?? new Date().toISOString(),
    query_params: sanitizeAndTrim(entry.query_params ?? {})
  }

  mirrorConsole('info', 'access_log', payload)
  fireAndForgetDbWrite(async () => {
    const db = await useDb()
    await queryDb(
      db,
      'CREATE access_logs CONTENT $entry;',
      { entry: payload },
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
    timestamp: entry.timestamp ?? new Date().toISOString(),
    metadata: sanitizeAndTrim(entry.metadata ?? {})
  }

  mirrorConsole('info', 'activity_log', payload)
  fireAndForgetDbWrite(async () => {
    const db = await useDb()
    await queryDb(
      db,
      'CREATE activity_logs CONTENT $entry;',
      { entry: payload },
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
    timestamp: new Date().toISOString(),
    level: errorValue.level,
    message: errorValue.message,
    stack: errorValue.stack,
    request_id: context?.request_id ? String(context.request_id) : null,
    path: context?.path ? String(context.path) : null,
    method: context?.method ? String(context.method) : null,
    context: sanitizeAndTrim(context ?? {}) as Record<string, unknown>
  } satisfies ErrorLogEntry

  mirrorConsole('error', 'error_log', payload)
  fireAndForgetDbWrite(async () => {
    const db = await useDb()
    await queryDb(
      db,
      'CREATE error_logs CONTENT $entry;',
      { entry: payload },
      { label: 'log error write', timeoutMs: 5_000, retryOnReconnect: false }
    )
  })
}

export async function runLoggingCleanup(trigger: 'manual' | 'scheduled' = 'manual') {
  const settings = settingsCache
  const now = Date.now()
  const cutoffs = {
    access: new Date(now - settings.retention_access_days * 86_400_000).toISOString(),
    activity: new Date(now - settings.retention_activity_days * 86_400_000).toISOString(),
    error: new Date(now - settings.retention_error_days * 86_400_000).toISOString()
  }

  const db = await useDb()
  const accessDeleted = await deleteOlderThan(db, 'access_logs', cutoffs.access)
  const activityDeleted = await deleteOlderThan(db, 'activity_logs', cutoffs.activity)
  const errorDeleted = await deleteOlderThan(db, 'error_logs', cutoffs.error)

  const result: CleanupResult = {
    access_deleted: accessDeleted,
    activity_deleted: activityDeleted,
    error_deleted: errorDeleted,
    total_deleted: accessDeleted + activityDeleted + errorDeleted
  }

  logActivity({
    action: 'system.log_cleanup',
    resource_type: 'logging',
    resource_id: null,
    metadata: {
      trigger,
      ...result
    },
    description: `Log cleanup completed (${result.total_deleted} rows deleted)`
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
  const response = await queryDb(
    db,
    'SELECT * FROM type::record($table, $id) LIMIT 1;',
    { table, id: id.includes(':') ? stringifyRecordId(id) : id },
    { label: `read ${type} log detail`, timeoutMs: 10_000 }
  )

  return firstRow<Record<string, unknown>>(response)
}

function applySettings(next: LoggingSettings) {
  settingsCache = { ...next }
  cacheInitialized = true

  for (const listener of settingsUpdateListeners) {
    try {
      listener(settingsCache)
    } catch {
      // Never let listener issues break cache updates.
    }
  }
}

async function persistLoggingSettings(settings: LoggingSettings) {
  const db = await useDb()
  await queryDb(
    db,
    `UPSERT type::record($table, $id) CONTENT $settings;`,
    {
      table: 'logging_settings',
      id: LOGGING_SETTINGS_ID,
      settings: {
        ...settings,
        updated_at: new Date().toISOString()
      }
    },
    { label: 'logging settings persist', timeoutMs: 10_000 }
  )
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
    cleanup_enabled: asBoolean(record.cleanup_enabled, defaults.cleanup_enabled),
    cleanup_cron: asCron(record.cleanup_cron, defaults.cleanup_cron),
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : new Date().toISOString()
  }

  return normalized
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

function asCron(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !isCronExpressionLikelyValid(value)) {
    return fallback
  }

  return value
}

function isCronExpressionLikelyValid(expression: string) {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) {
    return false
  }

  return parts.every(isCronFieldLikelyValid)
}

function isCronFieldLikelyValid(field: string) {
  if (!field) {
    return false
  }

  // Supports common cron tokens: *, 1, 1-5, */5, 1,2,3
  return field.split(',').every((segment) => {
    if (segment === '*') {
      return true
    }

    if (/^\*\/\d+$/.test(segment)) {
      return Number(segment.slice(2)) > 0
    }

    if (/^\d+$/.test(segment)) {
      return true
    }

    if (/^\d+-\d+$/.test(segment)) {
      const [start, end] = segment.split('-').map(Number)
      return (start ?? 0) <= (end ?? 0)
    }

    return false
  })
}

async function deleteOlderThan(db: Awaited<ReturnType<typeof useDb>>, table: string, cutoff: string) {
  const response = await queryDb(
    db,
    `SELECT count() AS total FROM ${table} WHERE timestamp < <datetime>$cutoff GROUP ALL;
     DELETE ${table} WHERE timestamp < <datetime>$cutoff;`,
    { cutoff },
    { label: `cleanup ${table}`, timeoutMs: 30_000 }
  )

  const count = firstRow<{ total?: number }>(response, 0)
  return Number(count?.total ?? 0)
}

function typeToTable(type: 'access' | 'activity' | 'errors') {
  if (type === 'access') {
    return 'access_logs'
  }

  if (type === 'activity') {
    return 'activity_logs'
  }

  return 'error_logs'
}
