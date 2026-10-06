import type { Surreal } from 'surrealdb'
import { queryDb } from '../db'
import { firstRow } from '../surrealResult'

export const ANALYTICS_GROUP_LIMIT = 1_000
export const ANALYTICS_MAX_RANGE_DAYS = 366
export const ANALYTICS_REPAIR_DAYS = 2 // 24h maximum session window + UTC day margin

/** Exact distinct stays in the DB. Only scalar results cross the SDK boundary.
 * DB grouping memory/latency is a separate measured release budget, not O(1).
 */
export function dailyAggregateSql(from = '$from', to = '$to') {
  return `LET $pv = (SELECT count() AS page_views FROM pageview WITH NOINDEX
    WHERE created_at >= ${from} AND created_at < ${to} GROUP ALL TIMEOUT 10s);
  LET $uv = (SELECT count() AS unique_visitors FROM
    (SELECT visitor_hash FROM pageview WITH NOINDEX WHERE created_at >= ${from} AND created_at < ${to}
      AND visitor_hash != NONE AND type::is_string(visitor_hash) AND visitor_hash != '' GROUP BY visitor_hash TIMEOUT 10s) GROUP ALL TIMEOUT 10s);
  LET $sessions = (SELECT count() AS sessions, math::sum(bounce) AS bounce_sessions,
    math::sum(seconds) AS total_visit_seconds FROM
    (SELECT IF pageview_count = 1 THEN 1 ELSE 0 END AS bounce,
      math::max([0, math::round((time::micros(last_seen_at) - time::micros(started_at)) / 1000000)]) AS seconds
     FROM analytics_session WITH NOINDEX WHERE started_at >= ${from} AND started_at < ${to} TIMEOUT 10s)
    GROUP ALL TIMEOUT 10s);
  LET $totals = {
    page_views: $pv[0].page_views ?? 0, unique_visitors: $uv[0].unique_visitors ?? 0,
    sessions: $sessions[0].sessions ?? 0, bounce_sessions: $sessions[0].bounce_sessions ?? 0,
    total_visit_seconds: $sessions[0].total_visit_seconds ?? 0
  };`
}

export interface AggregateTotals {
  page_views: number
  unique_visitors: number
  sessions: number
  bounce_sessions: number
  total_visit_seconds: number
}
export async function readAnalyticsTotals(db: Surreal, from: Date, to: Date): Promise<AggregateTotals> {
  const row = analyticsResult<AggregateTotals>(await queryDb(db, `${dailyAggregateSql()} RETURN [$totals];`, {from, to}, {label: 'analytics scalar totals', retry: 'readOnly', timeoutMs: 35_000}), 'page_views')
  if (!row || Object.values(row).some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid analytics aggregate')
  return row
}

export function analyticsResult<T>(response: unknown[], key: string): T | null {
  for (let index = response.length - 1; index >= 0; index--) {
    const row = firstRow<Record<string, unknown>>(response, index)
    if (row && Object.hasOwn(row, key)) return row as T
  }
  return null
}

export function analyticsDate(value: unknown): Date {
  // No numeric epochs/Infinity accepted at a persisted datetime boundary.
  const date = value instanceof Date ? value : new Date(typeof value === 'string' || value && typeof value === 'object' ? String(value) : '')
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid analytics datetime boundary')
  return date
}
