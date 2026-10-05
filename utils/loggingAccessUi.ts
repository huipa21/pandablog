const DAY_MS = 86_400_000

/** Keep the UI window aligned with whole UTC day-file retention. */
export function accessLogDateWindow(query: Record<string, unknown>, retentionDays: number, now: Date) {
  const days = Number.isInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 3650 ? retentionDays : 30
  const max = now.getTime()
  const min = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - days * DAY_MS
  const timestamp = (value: unknown, fallback: number) => {
    const raw = typeof value === 'string' ? value : ''
    const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw) ? `${raw}Z` : raw
    const parsed = utc ? Date.parse(utc) : NaN
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const to = Math.min(max, Math.max(min, timestamp(query.to, max)))
  const from = Math.min(to, Math.max(min, timestamp(query.from, to - DAY_MS)))
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    min: new Date(min).toISOString(),
    max: now.toISOString()
  }
}

/** datetime-local has no zone; these pickers explicitly display/edit UTC. */
export function accessLogPickerValue(iso: string) {
  return iso.slice(0, 23)
}

export function accessLogPickerIso(value: string) {
  return value ? `${value}Z` : ''
}
