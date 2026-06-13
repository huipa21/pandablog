import type { H3Event } from 'h3'
import { getQuery } from 'h3'
import type { Surreal } from 'surrealdb'
import { queryDb, useDb } from '../db'
import { queryRows } from '../surrealResult'
import { addUtcDays, startOfUtcDay, utcDateString } from './date'
import { isMissingAnalyticsTableError } from './tables'

export interface AnalyticsOverviewResponse {
  range: { from: string, to: string }
  scorecards: {
    pageViews: number
    uniqueVisitors: number
    uniqueVisitorsApproximate: boolean
    sessions: number
    bounceRate: number
    avgVisitSeconds: number
  }
  timeseries: Array<{
    date: string
    pageViews: number
    uniqueVisitors: number
    sessions: number
    bounceRate: number
    avgVisitSeconds: number
  }>
}

export interface AnalyticsTopPage {
  path: string
  views: number
}

export interface AnalyticsGeoRow {
  country: string
  region: string
  city: string
  views: number
}

interface DailyRollupRow {
  date?: unknown
  page_views?: unknown
  unique_visitors?: unknown
  sessions?: unknown
  bounce_sessions?: unknown
  total_visit_seconds?: unknown
}

interface DailyPageRow {
  path?: unknown
  views?: unknown
}

interface DailyGeoRow {
  country?: unknown
  region?: unknown
  city?: unknown
  views?: unknown
}

interface LivePageviewRow {
  path?: unknown
  visitor_hash?: unknown
  country?: unknown
  region?: unknown
  city?: unknown
}

interface LiveSessionRow {
  pageview_count?: unknown
  started_at?: unknown
  last_seen_at?: unknown
}

interface AnalyticsRange {
  from: Date
  to: Date
  todayStart: Date
  rollupStart: Date
  rollupEnd: Date
  liveStart: Date
}

export function parseAnalyticsRange(event: H3Event): AnalyticsRange {
  const query = getQuery(event)
  const now = new Date()
  const todayStart = startOfUtcDay(now)
  const to = parseDate(query.to) ?? addUtcDays(todayStart, 1)
  const preset = typeof query.range === 'string' ? query.range : '7d'
  const from = parseDate(query.from) ?? presetStart(preset, todayStart)
  const normalizedFrom = startOfUtcDay(from)
  const normalizedTo = startOfUtcDay(to) <= normalizedFrom ? addUtcDays(normalizedFrom, 1) : to
  const rollupStart = normalizedFrom < todayStart ? normalizedFrom : todayStart
  const rollupEnd = normalizedTo < todayStart ? normalizedTo : todayStart
  const liveStart = normalizedTo > todayStart ? new Date(Math.max(normalizedFrom.getTime(), todayStart.getTime())) : normalizedTo

  return {
    from: normalizedFrom,
    to: normalizedTo,
    todayStart,
    rollupStart,
    rollupEnd,
    liveStart
  }
}

export async function getAnalyticsOverview(range: AnalyticsRange): Promise<AnalyticsOverviewResponse> {
  const db = await useDb()
  const days = new Map<string, DailyStats>()
  const rollups = await readDailyRollups(db, range)
  for (const rollup of rollups) {
    days.set(rollup.date, rollup)
  }

  if (range.liveStart < range.to) {
    const live = await readLiveDailyStats(db, range.liveStart, range.to)
    days.set(live.date, live)
  }

  const timeseries = Array.from(days.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(statsToPoint)
  const totals = timeseries.reduce((acc, point) => {
    const source = days.get(point.date)
    if (!source) return acc
    acc.pageViews += source.pageViews
    acc.uniqueVisitors += source.uniqueVisitors
    acc.sessions += source.sessions
    acc.bounceSessions += source.bounceSessions
    acc.totalVisitSeconds += source.totalVisitSeconds
    return acc
  }, emptyStats('total'))

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    scorecards: {
      pageViews: totals.pageViews,
      uniqueVisitors: totals.uniqueVisitors,
      uniqueVisitorsApproximate: timeseries.length > 1,
      sessions: totals.sessions,
      bounceRate: ratio(totals.bounceSessions, totals.sessions),
      avgVisitSeconds: average(totals.totalVisitSeconds, totals.sessions)
    },
    timeseries
  }
}

export async function getAnalyticsTopPages(range: AnalyticsRange, limit: number): Promise<{ pages: AnalyticsTopPage[] }> {
  const db = await useDb()
  const counts = new Map<string, number>()

  if (range.rollupStart < range.rollupEnd) {
    const rows = await queryAnalyticsRows<DailyPageRow>(
      db,
      `SELECT path, math::sum(views) AS views
       FROM analytics_daily_page
       WHERE date >= $fromDate AND date < $toDate
       GROUP BY path;`,
      { fromDate: utcDateString(range.rollupStart), toDate: utcDateString(range.rollupEnd) },
      { label: 'analytics top pages rollup', timeoutMs: 10_000 },
      ['analytics_daily_page']
    )
    for (const row of rows) {
      addCount(counts, stringValue(row.path) || '/', numberValue(row.views))
    }
  }

  if (range.liveStart < range.to) {
    const rows = await queryAnalyticsRows<DailyPageRow>(
      db,
      `SELECT path, count() AS views
       FROM pageview
       WHERE created_at >= $from AND created_at < $to
       GROUP BY path;`,
      { from: range.liveStart, to: range.to },
      { label: 'analytics top pages live', timeoutMs: 10_000 },
      ['pageview']
    )
    for (const row of rows) {
      addCount(counts, stringValue(row.path) || '/', numberValue(row.views))
    }
  }

  return {
    pages: Array.from(counts.entries())
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit)
  }
}

export async function getAnalyticsGeo(range: AnalyticsRange, limit: number): Promise<{ locations: AnalyticsGeoRow[] }> {
  const db = await useDb()
  const counts = new Map<string, AnalyticsGeoRow>()

  if (range.rollupStart < range.rollupEnd) {
    const rows = await queryAnalyticsRows<DailyGeoRow>(
      db,
      `SELECT country, region, city, math::sum(views) AS views
       FROM analytics_daily_geo
       WHERE date >= $fromDate AND date < $toDate
       GROUP BY country, region, city;`,
      { fromDate: utcDateString(range.rollupStart), toDate: utcDateString(range.rollupEnd) },
      { label: 'analytics geo rollup', timeoutMs: 10_000 },
      ['analytics_daily_geo']
    )
    for (const row of rows) {
      addGeoCount(counts, row)
    }
  }

  if (range.liveStart < range.to) {
    const rows = await queryAnalyticsRows<DailyGeoRow>(
      db,
      `SELECT country, region, city, count() AS views
       FROM pageview
       WHERE created_at >= $from AND created_at < $to
       GROUP BY country, region, city;`,
      { from: range.liveStart, to: range.to },
      { label: 'analytics geo live', timeoutMs: 10_000 },
      ['pageview']
    )
    for (const row of rows) {
      addGeoCount(counts, row)
    }
  }

  return {
    locations: Array.from(counts.values())
      .sort((a, b) => b.views - a.views)
      .slice(0, limit)
  }
}

export function parseAnalyticsLimit(value: unknown, fallback: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(max, Math.max(1, Math.round(number)))
}

interface DailyStats {
  date: string
  pageViews: number
  uniqueVisitors: number
  sessions: number
  bounceSessions: number
  totalVisitSeconds: number
}

async function readDailyRollups(db: Surreal, range: AnalyticsRange): Promise<DailyStats[]> {
  if (range.rollupStart >= range.rollupEnd) {
    return []
  }

  const rows = await queryAnalyticsRows<DailyRollupRow>(
    db,
    `SELECT date, page_views, unique_visitors, sessions, bounce_sessions, total_visit_seconds
     FROM analytics_daily
     WHERE date >= $fromDate AND date < $toDate;`,
    { fromDate: utcDateString(range.rollupStart), toDate: utcDateString(range.rollupEnd) },
    { label: 'analytics overview rollups', timeoutMs: 10_000 },
    ['analytics_daily']
  )

  return rows.map(row => ({
    date: stringValue(row.date),
    pageViews: numberValue(row.page_views),
    uniqueVisitors: numberValue(row.unique_visitors),
    sessions: numberValue(row.sessions),
    bounceSessions: numberValue(row.bounce_sessions),
    totalVisitSeconds: numberValue(row.total_visit_seconds)
  })).filter(row => row.date)
}

async function readLiveDailyStats(db: Surreal, from: Date, to: Date): Promise<DailyStats> {
  const pageviews = await queryAnalyticsRows<LivePageviewRow>(
    db,
    `SELECT visitor_hash
     FROM pageview
     WHERE created_at >= $from AND created_at < $to;`,
    { from, to },
    { label: 'analytics overview live pageviews', timeoutMs: 10_000 },
    ['pageview']
  )
  const sessions = await queryAnalyticsRows<LiveSessionRow>(
    db,
    `SELECT pageview_count, started_at, last_seen_at
     FROM analytics_session
     WHERE started_at >= $from AND started_at < $to;`,
    { from, to },
    { label: 'analytics overview live sessions', timeoutMs: 10_000 },
    ['analytics_session']
  )
  const visitors = new Set(pageviews.map(row => stringValue(row.visitor_hash)).filter(Boolean))
  let bounceSessions = 0
  let totalVisitSeconds = 0

  for (const session of sessions) {
    if (numberValue(session.pageview_count) === 1) {
      bounceSessions += 1
    }
    const startedAt = dateValue(session.started_at)
    const lastSeenAt = dateValue(session.last_seen_at)
    if (startedAt && lastSeenAt) {
      totalVisitSeconds += Math.max(0, Math.round((lastSeenAt.getTime() - startedAt.getTime()) / 1000))
    }
  }

  return {
    date: utcDateString(from),
    pageViews: pageviews.length,
    uniqueVisitors: visitors.size,
    sessions: sessions.length,
    bounceSessions,
    totalVisitSeconds
  }
}

function statsToPoint(stats: DailyStats) {
  return {
    date: stats.date,
    pageViews: stats.pageViews,
    uniqueVisitors: stats.uniqueVisitors,
    sessions: stats.sessions,
    bounceRate: ratio(stats.bounceSessions, stats.sessions),
    avgVisitSeconds: average(stats.totalVisitSeconds, stats.sessions)
  }
}

function emptyStats(date: string): DailyStats {
  return {
    date,
    pageViews: 0,
    uniqueVisitors: 0,
    sessions: 0,
    bounceSessions: 0,
    totalVisitSeconds: 0
  }
}

async function queryAnalyticsRows<T>(
  db: Surreal,
  sql: string,
  params: Record<string, unknown>,
  options: NonNullable<Parameters<typeof queryDb>[3]>,
  tables: string[]
) {
  try {
    return queryRows<T>(await queryDb(db, sql, params, options))
  } catch (error) {
    if (isMissingAnalyticsTableError(error, tables)) {
      return []
    }
    throw error
  }
}

function presetStart(preset: string, todayStart: Date) {
  if (preset === 'today') return todayStart
  if (preset === '30d') return addUtcDays(todayStart, -29)
  return addUtcDays(todayStart, -6)
}

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function addCount(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value)
}

function addGeoCount(map: Map<string, AnalyticsGeoRow>, row: DailyGeoRow) {
  const location = {
    country: stringValue(row.country) || 'Unknown',
    region: stringValue(row.region),
    city: stringValue(row.city),
    views: numberValue(row.views)
  }
  const key = [location.country, location.region, location.city].join('\0')
  const current = map.get(key)
  if (current) {
    current.views += location.views
  } else {
    map.set(key, location)
  }
}

function ratio(value: number, total: number) {
  return total > 0 ? value / total : 0
}

function average(value: number, total: number) {
  return total > 0 ? Math.round(value / total) : 0
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return value
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (value && typeof value === 'object' && typeof (value as { toString?: unknown }).toString === 'function') {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}
