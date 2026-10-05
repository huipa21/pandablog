export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogCleanupType = 'access' | 'activity' | 'errors'
export type LogCleanupMode = 'older_than_days' | 'keep_latest'

export interface LoggingSettings {
  enabled: boolean
  debug_enabled: boolean
  debug_override_prod: boolean
  access_log_enabled: boolean
  activity_log_enabled: boolean
  error_log_enabled: boolean
  error_log_min_status: number
  log_level: LogLevel
  excluded_paths: string[]
  excluded_status_codes: number[]
  redact_fields: string[]
  retention_access_days: number
  retention_activity_days: number
  retention_error_days: number
  max_metadata_size_kb: number
  sampling_rate: number
  console_output: boolean
  updated_at?: string
}

export interface AccessLogEntry {
  timestamp?: string
  method: string
  path: string
  status_code: number
  response_time_ms: number
  ip?: string | null
  user_agent?: string | null
  request_id?: string | null
  query_params?: Record<string, unknown>
  referrer?: string | null
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

export interface ErrorLogEntry {
  timestamp?: string
  level: LogLevel
  message: string
  stack?: string | null
  status_code?: number | null
  context?: Record<string, unknown>
  request_id?: string | null
  path?: string | null
  method?: string | null
}

export interface RetentionReport {
  started_at: string
  finished_at: string
  duration_ms: number
  deleted: {
    access: number
    activity: number
    errors: number
    error_groups?: number
    access_files?: number
  }
  errors: string[]
}

export interface CleanupResult {
  type: LogCleanupType
  mode: LogCleanupMode
  value: number
  deleted: number
}
