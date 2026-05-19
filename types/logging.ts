export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LoggingSettings {
  enabled: boolean
  debug_enabled: boolean
  debug_override_prod: boolean
  access_log_enabled: boolean
  activity_log_enabled: boolean
  error_log_enabled: boolean
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
  cleanup_enabled: boolean
  cleanup_cron: string
  updated_at?: string
}

export interface LoggingSettingsResponse {
  settings: LoggingSettings
}

export interface LoggingSettingsUpdateResponse {
  ok: true
  settings: LoggingSettings
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

export interface ErrorLogEntry {
  timestamp?: string
  level: LogLevel
  message: string
  stack?: string | null
  context?: Record<string, unknown>
  request_id?: string | null
  path?: string | null
  method?: string | null
}

export interface LogStatsResponse {
  access: { count: number, oldest: string | null, newest: string | null }
  activity: { count: number, oldest: string | null, newest: string | null }
  errors: { count: number, oldest: string | null, newest: string | null }
  estimate_bytes: number
}

export interface CleanupResult {
  access_deleted: number
  activity_deleted: number
  error_deleted: number
  total_deleted: number
}
