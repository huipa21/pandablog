import { getErrorCauseChain, redactDeep, trimByMaxSize } from './logging-logic'
import type { LogLevel, LoggingSettings } from '~/types/logging'

export type ConsoleMode = 'off' | 'errors' | 'all'
export type ConsoleFormat = 'json' | 'pretty'
export interface ConsoleConfig {
  mode: ConsoleMode
  format: ConsoleFormat
}

export interface ConsoleEntry {
  ts?: string | Date
  level: LogLevel
  kind: 'error_log' | 'activity_log' | 'app'
  msg: string
  fingerprint?: string
  request_id?: string | null
  method?: string | null
  path?: string | null
  status?: number | null
  duration_ms?: number | null
  ip?: string | null
  ua?: string | null
  err?: unknown
  ctx?: unknown
}

type ConsoleSettings = Partial<Pick<LoggingSettings, 'console_output' | 'redact_fields' | 'max_metadata_size_kb'>>
const DEFAULT_REDACT_FIELDS = ['password', 'token', 'authorization', 'cookie']
// Include the terminating newline in the byte budget.
export const MAX_CONSOLE_LINE_BYTES = 16 * 1024
const MAX_CONTENT_BYTES = MAX_CONSOLE_LINE_BYTES - 1
const guardedStreams = new WeakSet<NodeJS.WriteStream>()

export function resolveConsoleConfig(env: NodeJS.ProcessEnv): ConsoleConfig {
  return {
    mode: env.LOG_CONSOLE === 'off' || env.LOG_CONSOLE === 'all' || env.LOG_CONSOLE === 'errors' ? env.LOG_CONSOLE : 'errors',
    format: env.LOG_FORMAT === 'json' || env.LOG_FORMAT === 'pretty' ? env.LOG_FORMAT : env.NODE_ENV === 'production' ? 'json' : 'pretty'
  }
}

const consoleConfig = resolveConsoleConfig(process.env)
for (const [key, values] of [['LOG_CONSOLE', ['off', 'errors', 'all']], ['LOG_FORMAT', ['json', 'pretty']]] as const) {
  const value = process.env[key]
  if (value !== undefined && !(values as readonly string[]).includes(value)) {
    console.warn(`[logging] invalid ${key}=${value}; falling back to ${key === 'LOG_CONSOLE' ? consoleConfig.mode : consoleConfig.format}`)
  }
}

export function getConsoleConfig(): ConsoleConfig {
  return { ...consoleConfig }
}

export function effectiveConsoleMode(mode: ConsoleMode, consoleOutput = false): ConsoleMode {
  return mode === 'errors' && consoleOutput ? 'all' : mode
}

/** Convert to JSON-safe data before redaction, so cycles/BigInt/toJSON cannot bypass it. */
function jsonSafe(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  if (seen.has(value)) {
    return '[Circular]'
  }
  if (depth >= 32) {
    return '[Max depth]'
  }
  seen.add(value)
  try {
    if ('toJSON' in value && typeof value.toJSON === 'function') {
      const converted: unknown = value.toJSON()
      if (converted !== value) {
        return jsonSafe(converted, seen, depth + 1)
      }
    }
    if (Array.isArray(value)) {
      return value.map(item => jsonSafe(item, seen, depth + 1))
    }
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined)
      .map(([key, item]) => [key, jsonSafe(item, seen, depth + 1)]))
  } finally {
    seen.delete(value)
  }
}

export function sanitizeLogContext(input: unknown, settings: ConsoleSettings = {}): unknown {
  try {
    return trimByMaxSize(redactDeep(jsonSafe(input), settings.redact_fields ?? DEFAULT_REDACT_FIELDS), settings.max_metadata_size_kb ?? 50)
  } catch {
    return { _unserializable: true }
  }
}

function consoleError(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const record = typeof value === 'object' ? value as Record<string, unknown> : undefined
  const result: Record<string, unknown> = {
    name: record?.name ?? 'Error',
    message: record?.message ?? String(value)
  }
  if (record?.stack != null) {
    result.stack = record.stack
  }
  const cause = getErrorCauseChain(value)
  if (cause) {
    result.cause = cause
  }
  return result
}

function envelope(entry: ConsoleEntry, settings: ConsoleSettings) {
  const timestamp = entry.ts instanceof Date ? entry.ts : entry.ts ? new Date(entry.ts) : new Date()
  const result = jsonSafe(redactDeep(jsonSafe({
    ts: timestamp.toISOString(),
    level: entry.level,
    kind: entry.kind,
    msg: entry.msg,
    fingerprint: entry.fingerprint,
    request_id: entry.request_id,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    duration_ms: entry.duration_ms,
    ip: entry.ip,
    ua: entry.ua,
    err: consoleError(entry.err),
    ctx: entry.ctx
  }), settings.redact_fields ?? DEFAULT_REDACT_FIELDS)) as Record<string, unknown>
  if (result.ctx !== undefined) {
    result.ctx = trimByMaxSize(result.ctx, settings.max_metadata_size_kb ?? 50)
  }
  return result
}

function fallbackLine() {
  return JSON.stringify({ ts: new Date().toISOString(), level: 'error', kind: 'app', msg: '[logging] unserializable entry' })
}

function truncateUtf8(text: string, maxBytes: number) {
  // Decode only complete UTF-8 characters (never create broken surrogate pairs).
  const bytes = Buffer.from(text)
  let end = Math.min(bytes.length, maxBytes)
  while (end > 0 && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
    end -= 1
  }
  return bytes.subarray(0, end).toString('utf8')
}

export function formatJsonLine(entry: ConsoleEntry, settings: ConsoleSettings = {}): string {
  try {
    const data = envelope(entry, settings)
    let line = JSON.stringify(data)
    const oversized = () => Buffer.byteLength(line) > MAX_CONTENT_BYTES
    const err = data.err as Record<string, unknown> | undefined
    if (oversized() && typeof err?.stack === 'string') {
      const stack = err.stack
      err.stack = '[truncated]'
      line = JSON.stringify(data)
      if (!oversized()) {
        // Keep as much stack as fits, accounting for JSON escaping and UTF-8.
        let low = 0
        let high = Buffer.byteLength(stack)
        while (low < high) {
          const mid = Math.ceil((low + high) / 2)
          err.stack = `${truncateUtf8(stack, mid)}[truncated]`
          if (Buffer.byteLength(JSON.stringify(data)) <= MAX_CONTENT_BYTES) {
            low = mid
          } else {
            high = mid - 1
          }
        }
        err.stack = `${truncateUtf8(stack, low)}[truncated]`
        line = JSON.stringify(data)
      }
    }
    if (oversized() && data.ctx !== undefined) {
      data.ctx = { _truncated: true }
      line = JSON.stringify(data)
    }
    if (oversized()) {
      // Path/message/UA/cause can also be unbounded. Keep a valid envelope even
      // when it is not the stack or context that exceeded the limit.
      const shorten = (value: unknown): unknown => {
        if (typeof value === 'string') {
          return Buffer.byteLength(value) > 512 ? `${truncateUtf8(value, 512)}[truncated]` : value
        }
        if (value && typeof value === 'object') {
          return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shorten(item)]))
        }
        return value
      }
      line = JSON.stringify(shorten(data))
    }
    return Buffer.byteLength(line) <= MAX_CONTENT_BYTES ? line : fallbackLine()
  } catch {
    return fallbackLine()
  }
}

export function formatPrettyLine(entry: ConsoleEntry, settings: ConsoleSettings = {}): string {
  try {
    // Share sanitization and size limits with JSON, including the fallback.
    const data = JSON.parse(formatJsonLine(entry, settings)) as Record<string, any>
    const request = data.request_id ? ` (${data.request_id})` : ''
    const http = [data.method, data.path, data.status].filter(value => value != null).join(' ')
    const stack = data.err?.stack ? `\n  ${String(data.err.stack).replace(/\n/g, '\n  ')}` : ''
    const line = `${String(data.ts).slice(11, 23)} ${String(data.level).toUpperCase()} ${data.kind} ${data.msg}${request}${data.fingerprint ? ` [fp=${data.fingerprint}]` : ''}${http ? ` [${http}]` : ''}${stack}`
    return truncateUtf8(line, MAX_CONTENT_BYTES)
  } catch {
    return fallbackLine()
  }
}

/** Fire-and-forget console sink: a failing stream must never break a request. */
export function writeConsoleEntry(entry: ConsoleEntry, settings: ConsoleSettings = {}) {
  try {
    const mode = effectiveConsoleMode(consoleConfig.mode, settings.console_output)
    if (mode === 'off' || (mode === 'errors' && entry.level !== 'warn' && entry.level !== 'error')) {
      return
    }
    const line = consoleConfig.format === 'json' ? formatJsonLine(entry, settings) : formatPrettyLine(entry, settings)
    const stream = entry.level === 'warn' || entry.level === 'error' ? process.stderr : process.stdout
    if (!guardedStreams.has(stream)) {
      // A write callback alone does not suppress the stream's error event (EPIPE).
      // Install only one handler per stream, not one per entry.
      stream.on('error', () => {})
      guardedStreams.add(stream)
    }
    stream.write(`${line}\n`, () => { /* Ignore asynchronous write failures. */ })
  } catch {
    // Never recurse into logging when the console itself fails.
  }
}
