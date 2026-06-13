import { createHash } from 'node:crypto'
import type { Surreal } from 'surrealdb'
import { queryDb, useDb } from '../db'
import { firstRow, queryRows } from '../surrealResult'
import { getAnalyticsSettings } from '../settings'
import { addUtcDays, startOfUtcDay, utcDateString } from './date'
import { isMissingAnalyticsTableError } from './tables'

interface PageviewRollupRow {
  path?: unknown
  visitor_hash?: unknown
  country?: unknown
  region?: unknown
  city?: unknown
}

interface SessionRollupRow {
  pageview_count?: unknown
  started_at?: unknown
  last_seen_at?: unknown
}

interface OldestRow {
  oldest?: unknown
}

export async function rollupCompletedAnalyticsDays(now = new Date()) {
  const db = await useDb()
  const todayStart = startOfUtcDay(now)
  const oldest = await findOldestPageviewDate(db, todayStart)
  if (!oldest) {
    return { rolledUpDays: 0 }
  }

  let rolledUpDays = 0
  for (let dayStart = startOfUtcDay(oldest); dayStart < todayStart; dayStart = addUtcDays(dayStart, 1)) {
    await rollupAnalyticsDay(db, dayStart)
    rolledUpDays += 1
  }

  return { rolledUpDays }
}

export async function cleanupAnalyticsRetention(now = new Date()) {
  const settings = getAnalyticsSettings()
  const db = await useDb()
  const todayStart = startOfUtcDay(now)
  const cutoff = startOfUtcDay(addUtcDays(todayStart, -settings.analytics_retention_days))

  try {
    await queryDb(
      db,
      `DELETE pageview WHERE created_at < $cutoff AND created_at < $todayStart;
       DELETE analytics_session WHERE last_seen_at < $cutoff AND last_seen_at < $todayStart;`,
      { cutoff, todayStart },
      { label: 'analytics retention cleanup', timeoutMs: 30_000, retryOnReconnect: false }
    )
  } catch (error) {
    if (isMissingAnalyticsTableError(error, ['pageview', 'analytics_session'])) {
      return
    }
    throw error
  }
}

export async function rollupAnalyticsDay(db: Surreal, dayStart: Date) {
  const date = utcDateString(dayStart)
  const dayEnd = addUtcDays(dayStart, 1)
  const pageviews = queryRows<PageviewRollupRow>(await queryDb(
    db,
    `SELECT path, visitor_hash, country, region, city
     FROM pageview
     WHERE created_at >= $dayStart AND created_at < $dayEnd;`,
    { dayStart, dayEnd },
    { label: 'analytics rollup pageviews', timeoutMs: 30_000 }
  ))
  const sessions = queryRows<SessionRollupRow>(await queryDb(
    db,
    `SELECT pageview_count, started_at, last_seen_at
     FROM analytics_session
     WHERE started_at >= $dayStart AND started_at < $dayEnd;`,
    { dayStart, dayEnd },
    { label: 'analytics rollup sessions', timeoutMs: 30_000 }
  ))

  const visitorHashes = new Set<string>()
  const pageCounts = new Map<string, number>()
  const geoCounts = new Map<string, { country?: string, region?: string, city?: string, views: number }>()

  for (const row of pageviews) {
    const visitorHash = stringValue(row.visitor_hash)
    if (visitorHash) {
      visitorHashes.add(visitorHash)
    }

    const path = stringValue(row.path) || '/'
    pageCounts.set(path, (pageCounts.get(path) ?? 0) + 1)

    const geo = {
      country: stringValue(row.country) || undefined,
      region: stringValue(row.region) || undefined,
      city: stringValue(row.city) || undefined
    }
    const geoKey = [geo.country ?? '', geo.region ?? '', geo.city ?? ''].join('\0')
    const current = geoCounts.get(geoKey) ?? { ...geo, views: 0 }
    current.views += 1
    geoCounts.set(geoKey, current)
  }

  let bounceSessions = 0
  let totalVisitSeconds = 0
  for (const session of sessions) {
    const pageviewCount = numberValue(session.pageview_count)
    if (pageviewCount === 1) {
      bounceSessions += 1
    }

    const startedAt = dateValue(session.started_at)
    const lastSeenAt = dateValue(session.last_seen_at)
    if (startedAt && lastSeenAt) {
      totalVisitSeconds += Math.max(0, Math.round((lastSeenAt.getTime() - startedAt.getTime()) / 1000))
    }
  }

  await queryDb(
    db,
    `UPSERT type::record($table, $id) CONTENT {
      date: $date,
      page_views: $pageViews,
      unique_visitors: $uniqueVisitors,
      sessions: $sessions,
      bounce_sessions: $bounceSessions,
      total_visit_seconds: $totalVisitSeconds,
      rolled_up_at: time::now()
    };`,
    {
      table: 'analytics_daily',
      id: date,
      date,
      pageViews: pageviews.length,
      uniqueVisitors: visitorHashes.size,
      sessions: sessions.length,
      bounceSessions,
      totalVisitSeconds
    },
    { label: 'analytics daily rollup upsert', timeoutMs: 10_000, retryOnReconnect: false }
  )

  await rewritePageRollups(db, date, pageCounts)
  await rewriteGeoRollups(db, date, geoCounts)
}

async function findOldestPageviewDate(db: Surreal, before: Date) {
  let row: OldestRow | null = null
  try {
    row = firstRow<OldestRow>(await queryDb(
      db,
      'SELECT math::min(created_at) AS oldest FROM pageview WHERE created_at < $before GROUP ALL;',
      { before },
      { label: 'analytics oldest pageview lookup', timeoutMs: 10_000 }
    ))
  } catch (error) {
    if (isMissingAnalyticsTableError(error, ['pageview'])) {
      return null
    }
    throw error
  }

  return dateValue(row?.oldest)
}

async function rewritePageRollups(db: Surreal, date: string, pageCounts: Map<string, number>) {
  await queryDb(db, 'DELETE analytics_daily_page WHERE date = $date;', { date }, { label: 'analytics page rollup reset', timeoutMs: 10_000, retryOnReconnect: false })

  for (const [path, views] of pageCounts) {
    await queryDb(
      db,
      `CREATE type::record($table, $id) CONTENT {
        date: $date,
        path: $path,
        views: $views,
        rolled_up_at: time::now()
      };`,
      { table: 'analytics_daily_page', id: deterministicId(`${date}:${path}`), date, path, views },
      { label: 'analytics page rollup create', timeoutMs: 10_000, retryOnReconnect: false }
    )
  }
}

async function rewriteGeoRollups(
  db: Surreal,
  date: string,
  geoCounts: Map<string, { country?: string, region?: string, city?: string, views: number }>
) {
  await queryDb(db, 'DELETE analytics_daily_geo WHERE date = $date;', { date }, { label: 'analytics geo rollup reset', timeoutMs: 10_000, retryOnReconnect: false })

  for (const geo of geoCounts.values()) {
    const assignments = [
      'date = $date',
      'views = $views',
      'rolled_up_at = time::now()'
    ]
    const params: Record<string, unknown> = {
      date,
      views: geo.views
    }

    for (const key of ['country', 'region', 'city'] as const) {
      if (geo[key]) {
        assignments.push(`${key} = $${key}`)
        params[key] = geo[key]
      }
    }

    await queryDb(
      db,
      `CREATE type::record($table, $id) SET ${assignments.join(', ')};`,
      {
        ...params,
        table: 'analytics_daily_geo',
        id: deterministicId(`${date}:${geo.country ?? ''}:${geo.region ?? ''}:${geo.city ?? ''}`)
      },
      { label: 'analytics geo rollup create', timeoutMs: 10_000, retryOnReconnect: false }
    )
  }
}

function deterministicId(value: string) {
  return createHash('sha1').update(value).digest('hex')
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
