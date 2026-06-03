import type { LoggingSettings } from '~/types/logging'

export function shouldAllowDebug(settings: LoggingSettings) {
  if (!settings.enabled) {
    return false
  }

  if (!settings.debug_override_prod) {
    return false
  }

  return settings.debug_enabled
}

export function shouldRecordAccessLog(pathname: string, statusCode: number, settings: LoggingSettings, randomValue = Math.random()) {
  if (!settings.enabled || !settings.access_log_enabled) {
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

export function olderThanRetention(timestamp: string | Date, retentionDays: number, now = Date.now()) {
  const timeValue = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp.getTime()
  if (!Number.isFinite(timeValue)) {
    return false
  }

  return timeValue < now - retentionDays * 86_400_000
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}
