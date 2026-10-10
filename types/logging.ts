export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogCleanupType = 'activity' | 'errors'
export type LogCleanupMode = 'older_than_days' | 'keep_latest'

export interface LoggingSettings {
  enabled: boolean
  debug_enabled: boolean
  debug_override_prod: boolean
  activity_log_enabled: boolean
  error_log_enabled: boolean
  error_log_min_status: number
  error_occurrences_per_group: number
  log_level: LogLevel
  redact_fields: string[]
  retention_activity_days: number
  retention_error_days: number
  max_metadata_size_kb: number
  /** Live upgrade from LOG_CONSOLE=errors to all; cannot override off. */
  console_output: boolean
  updated_at?: string
}

export interface ActivityLogEntry {
  timestamp?: string
  action: string
  resource_type: string
  resource_id?: string | null
  metadata?: Record<string, unknown>
  ip?: string | null
  request_id?: string | null
  description?: string | null
}

export interface ErrorCause {
  name: string
  message: string
  cause?: ErrorCause
}

export interface ErrorGroup {
  id?: string
  fingerprint: string
  fingerprint_version: number
  name?: string | null
  message: string
  route?: string | null
  status_code?: number | null
  level: LogLevel
  /** Lifetime occurrences, including rate-guard aggregates; not retained sample count. */
  count: number
  first_seen: string
  last_seen: string
  last_stack?: string | null
  read_at?: string | null
  resolved_at?: string | null
  regressed: boolean
}

export interface RetentionReport {
  started_at: string
  finished_at: string
  duration_ms: number
  deleted: {
    activity: number
    /** Deleted occurrence rows, including age retention and sample caps. */
    errors: number
    error_groups?: number
  }
  errors: string[]
}

export interface CleanupResult {
  type: LogCleanupType
  mode: LogCleanupMode
  value: number
  /** Deleted DB rows. */
  deleted: number
}
