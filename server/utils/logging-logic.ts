import type { ErrorCause, LoggingSettings } from '~/types/logging'

/** Keep stored/custom prefixes first, then append missing defaults without mutation. */
export function mergeExcludedPaths(stored: string[], defaults: string[]): string[] {
  return [...new Set([...stored, ...defaults])]
}

export function shouldCaptureHookError(status: number, minStatus: number): boolean {
  return status >= minStatus
}

/** Follow the hook's status precedence, falling back safely for malformed values. */
export function resolveErrorStatus(error: unknown, responseStatus?: unknown): number {
  try {
    const record = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
    const status = record?.statusCode ?? record?.status ?? responseStatus ?? 500
    return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500
  } catch {
    return 500
  }
}

/** A bounded, stack-free chain shared by persisted context and the console sink. */
export function getErrorCauseChain(error: unknown): ErrorCause | undefined {
  function summarize(value: unknown, remaining: number): ErrorCause | undefined {
    if (value == null || remaining === 0) {
      return undefined
    }
    const record = typeof value === 'object' ? value as Record<string, unknown> : undefined
    const result: ErrorCause = {
      name: typeof record?.name === 'string' ? record.name : 'Error',
      message: typeof record?.message === 'string' ? record.message : String(value)
    }
    const cause = summarize(record?.cause, remaining - 1)
    if (cause) {
      result.cause = cause
    }
    return result
  }

  try {
    return error && typeof error === 'object' ? summarize((error as Record<string, unknown>).cause, 3) : undefined
  } catch {
    // Inspecting exotic thrown values must not make logging throw.
    return undefined
  }
}

export function extractErrorContext(error: unknown) {
  const context: { cause?: ErrorCause, unhandled?: boolean, fatal?: boolean } = {}
  const cause = getErrorCauseChain(error)
  if (cause) {
    context.cause = cause
  }
  try {
    const record = error && typeof error === 'object' ? error as Record<string, unknown> : undefined
    if (record?.unhandled === true) context.unhandled = true
    if (record?.fatal === true) context.fatal = true
  } catch {
    // Keep the safe cause summary even if a flag getter fails.
  }
  return context
}

export function shouldAllowDebug(settings: LoggingSettings) {
  if (!settings.enabled) {
    return false
  }

  if (!settings.debug_override_prod) {
    return false
  }

  return settings.debug_enabled
}

export function isHealthCheckPath(pathname: string) {
  const path = pathname.split('?', 1)[0]
  return path === '/api/health' || path === '/api/health/'
}

export function shouldRecordAccessLog(pathname: string, statusCode: number, settings: LoggingSettings, randomValue = Math.random()) {
  if (isHealthCheckPath(pathname) || !settings.enabled || !settings.access_log_enabled) {
    return false
  }

  if (settings.excluded_paths.some(prefix => pathname.startsWith(prefix))) {
    return false
  }

  if (settings.excluded_status_codes.includes(statusCode)) {
    return false
  }

  return randomValue < settings.sampling_rate
}

export function redactDeep(input: unknown, redactFields: string[]): unknown {
  if (Array.isArray(input)) {
    return input.map(item => redactDeep(item, redactFields))
  }

  if (input && typeof input === 'object') {
    const lowered = new Set(redactFields.map(field => field.toLowerCase()))
    const out: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (lowered.has(key.toLowerCase())) {
        out[key] = '[REDACTED]'
      } else {
        out[key] = redactDeep(value, redactFields)
      }
    }

    return out
  }

  return input
}

export function trimByMaxSize(input: unknown, maxKb: number) {
  const maxBytes = Math.max(1, Math.floor(maxKb)) * 1024
  const serialized = safeStringify(input)

  if (serialized.length <= maxBytes) {
    return input
  }

  return {
    _truncated: true,
    _preview: serialized.slice(0, maxBytes)
  }
}

export function applySettingsPatch(current: LoggingSettings, patch: Partial<LoggingSettings>): LoggingSettings {
  return {
    ...current,
    ...patch,
    updated_at: new Date().toISOString()
  }
}

/** Fixed-window occurrence guard; suppressed counts are drained independently of arrivals. */
export function createErrorRateGuard({ windowMs, max }: { windowMs: number; max: number }) {
  if (!Number.isFinite(windowMs) || windowMs < 1 || !Number.isSafeInteger(max) || max < 1) throw new Error('Invalid error rate guard')
  const entries = new Map<string, { start: number; writes: number; pending: number; flushed: number }>()
  return {
    hit(fingerprint: string, now = Date.now()): boolean {
      let entry = entries.get(fingerprint)
      if (!entry) {
        // Prune inactive keys rather than allowing an unbounded lifetime cache.
        for (const [key, value] of entries) if (!value.pending && now - value.start >= windowMs) entries.delete(key)
        entry = { start: now, writes: 0, pending: 0, flushed: now }
        entries.set(fingerprint, entry)
      }
      if (now - entry.start >= windowMs) { entry.start = now; entry.writes = 0 }
      if (entry.writes++ < max) return true
      entry.pending++
      return false
    },
    drain(now = Date.now(), force = false): Array<{ fingerprint: string; count: number }> {
      const result: Array<{ fingerprint: string; count: number }> = []
      for (const [fingerprint, entry] of entries) {
        if (entry.pending && (force || now - entry.flushed >= 1000)) {
          result.push({ fingerprint, count: entry.pending })
          entry.pending = 0
          entry.flushed = now
        }
        if (!entry.pending && now - entry.start >= windowMs) entries.delete(fingerprint)
      }
      return result
    }
  }
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}
