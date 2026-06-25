export function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function utcDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

export interface GeoWindowRange {
  from: Date
  to: Date
  todayStart: Date
}

export interface GeoQueryWindows {
  rollup: { from: Date, to: Date } | null
  raw: { from: Date, to: Date } | null
}

/**
 * Splits a requested analytics range into the windows the geo map should read
 * from. Geo can be backfilled after the fact (for example when the GeoIP
 * database is added later), so daily geo rollups built before the database
 * existed are stale. Raw pageviews are retained for `retentionDays` and each
 * one already carries the geo resolved at insert time, so we read geo straight
 * from the raw rows for every in-retention day and only fall back to the
 * pre-aggregated rollup table for older days whose raw pageviews were pruned.
 */
export function resolveGeoQueryWindows(range: GeoWindowRange, retentionDays: number): GeoQueryWindows {
  const days = Math.max(1, Math.floor(retentionDays))
  const rawCutoff = startOfUtcDay(addUtcDays(range.todayStart, -days))
  const rawFrom = new Date(Math.max(range.from.getTime(), rawCutoff.getTime()))
  const rollupTo = new Date(Math.min(range.to.getTime(), rawCutoff.getTime()))

  return {
    rollup: range.from < rollupTo ? { from: range.from, to: rollupTo } : null,
    raw: rawFrom < range.to ? { from: rawFrom, to: range.to } : null
  }
}
