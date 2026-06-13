import type { Surreal } from 'surrealdb'
import { queryDb } from '../db'
import { firstRow, recordIdPart, stringifyRecordId } from '../surrealResult'
import type { AnalyticsGeo } from './types'

interface AnalyticsSessionRecord {
  id?: unknown
}

export async function resolveAnalyticsSession(
  db: Surreal,
  visitorHash: string,
  geo: AnalyticsGeo,
  now: Date,
  sessionWindowMinutes: number
) {
  const cutoff = new Date(now.getTime() - sessionWindowMinutes * 60_000)
  const existing = firstRow<AnalyticsSessionRecord>(await queryDb(
    db,
    `SELECT id FROM analytics_session
     WHERE visitor_hash = $visitorHash
       AND last_seen_at >= $cutoff
     ORDER BY last_seen_at DESC
     LIMIT 1;`,
    { visitorHash, cutoff },
    { label: 'analytics session lookup', timeoutMs: 5_000 }
  ))

  if (existing?.id) {
    const sessionRecord = stringifyRecordId(existing.id)
    await queryDb(
      db,
      `UPDATE type::record($table, $id) SET
        last_seen_at = $now,
        pageview_count = pageview_count + 1;`,
      { table: 'analytics_session', id: recordIdPart(sessionRecord, 'analytics_session'), now },
      { label: 'analytics session update', timeoutMs: 5_000 }
    )
    return sessionRecord
  }

  const payload = {
    visitor_hash: visitorHash,
    pageview_count: 1,
    started_at: now,
    last_seen_at: now,
    ...geo
  }
  const created = firstRow<AnalyticsSessionRecord>(await queryDb(
    db,
    'CREATE analytics_session CONTENT $session;',
    { session: payload },
    { label: 'analytics session create', timeoutMs: 5_000 }
  ))

  return created?.id ? stringifyRecordId(created.id) : null
}
