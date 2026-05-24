export function queryRows<T>(response: unknown, index = 0): T[] {
  const entry = Array.isArray(response) ? response[index] : response

  if (Array.isArray(entry)) {
    return entry as T[]
  }

  if (entry && typeof entry === 'object') {
    const result = (entry as { result?: unknown }).result
    if (Array.isArray(result)) {
      return result as T[]
    }
  }

  return []
}

export function firstRow<T>(response: unknown, index = 0): T | null {
  return queryRows<T>(response, index)[0] ?? null
}

export function stringifyRecordId(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const record = value as { tb?: string, table?: string, id?: unknown, toString?: () => string }
    const table = record.tb ?? record.table

    if (table && record.id !== undefined) {
      return `${table}:${stringifyRecordPart(record.id)}`
    }

    if (typeof record.toString === 'function') {
      return record.toString()
    }
  }

  return String(value)
}

export function stringifyRecordPart(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (value && typeof value === 'object') {
    const record = value as { toString?: () => string }
    if (typeof record.toString === 'function') {
      return record.toString()
    }
  }

  return String(value)
}

export function recordIdPart(value: string, table: string) {
  const decoded = safeDecodeRecordId(value)
  const prefix = `${table}:`
  let normalized = decoded.trim()

  // Be forgiving with accidentally double-prefixed ids like "post:post:abc".
  while (normalized.startsWith(prefix)) {
    normalized = normalized.slice(prefix.length)
  }

  return normalized
}

function safeDecodeRecordId(value: string) {
  let current = value

  // Decode up to twice to handle values that were accidentally encoded more than once.
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(current)
      if (decoded === current) {
        break
      }
      current = decoded
    } catch {
      break
    }
  }

  return current
}