import { queryDb, useDb } from './db'
import { firstRow, queryRows, stringifyRecordId } from './surrealResult'
import { errorFingerprint, normalizeRoute } from './error-fingerprint'
import type { ErrorGroup, LogLevel } from '~/types/logging'

export const ERROR_GROUP_BACKFILL_KEY = '__error_groups_backfill_v1'

function timestamp(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : String(value)
  if (!Number.isFinite(Date.parse(text))) throw new Error('Invalid error backfill timestamp')
  // Preserve SurrealDB nanoseconds, including in the keyset cursor.
  return text
}
function timeKey(value: string) {
  const iso = new Date(value).toISOString()
  const fraction = /\.(\d+)Z$/.exec(value)?.[1] ?? iso.slice(20, 23)
  return `${iso.slice(0, 19)}.${fraction.padEnd(9, '0')}Z`
}

export function occurrenceFingerprint(row: Record<string, unknown>) {
  return errorFingerprint({ name: typeof row.name === 'string' ? row.name : 'Error', message: String(row.message ?? ''), stack: typeof row.stack === 'string' ? row.stack : null, path: typeof row.path === 'string' ? row.path : null, status: typeof row.status_code === 'number' ? row.status_code : 500 })
}

/** Pure aggregation used by the paged migration and its restart tests. */
export function groupOccurrences(rows: Array<Record<string, unknown>>): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>()
  for (const row of rows) {
    const fp = occurrenceFingerprint(row)
    const seen = timestamp(row.timestamp)
    const read = row.read_at ? timestamp(row.read_at) : null
    const sample = {
      name: typeof row.name === 'string' ? row.name : 'Error', message: String(row.message ?? ''),
      route: normalizeRoute(typeof row.path === 'string' ? row.path : null),
      status_code: typeof row.status_code === 'number' ? row.status_code : 500,
      level: (row.level ?? 'error') as LogLevel, last_stack: typeof row.stack === 'string' ? row.stack : null
    }
    const group = groups.get(fp)
    if (!group) {
      groups.set(fp, { ...sample, fingerprint: fp, fingerprint_version: 1, count: 1, first_seen: seen, last_seen: seen, read_at: read, resolved_at: null, regressed: false })
      continue
    }
    group.count++
    if (timeKey(seen) < timeKey(group.first_seen)) group.first_seen = seen
    if (timeKey(seen) >= timeKey(group.last_seen)) Object.assign(group, sample, { last_seen: seen })
    group.read_at = group.read_at && read ? (timeKey(read) > timeKey(group.read_at) ? read : group.read_at) : null
  }
  return [...groups.values()]
}

export async function runErrorGroupBackfill(db: Awaited<ReturnType<typeof useDb>>) {
  if (firstRow(await queryDb(db, 'SELECT * FROM app_settings WHERE key = $key LIMIT 1;', { key: ERROR_GROUP_BACKFILL_KEY }, { label: 'error groups backfill marker check', timeoutMs: 5000, retryOnReconnect: false }))) return
  let cursor: { timestamp: string; id: unknown } | null = null
  let migrated = 0
  for (;;) {
    const rows: Array<Record<string, unknown>> = queryRows<Record<string, unknown>>(await queryDb(db,
      `SELECT * FROM error_logs WITH NOINDEX WHERE fingerprint = NONE
       ${cursor ? "AND (timestamp > <datetime>$ts OR (timestamp = <datetime>$ts AND id > type::record('error_logs', $id)))" : ''}
       ORDER BY timestamp ASC, id ASC LIMIT 1000;`,
      { ts: cursor?.timestamp, id: cursor?.id }, { label: 'error groups backfill page', timeoutMs: 30_000, retryOnReconnect: false }))
    if (!rows.length) break
    const params: Record<string, unknown> = {}
    const sql = ['BEGIN TRANSACTION;']
    for (const [index, group] of groupOccurrences(rows).entries()) {
      params[`g${index}`] = group
      sql.push(`LET $source = $g${index};
        LET $g = object::extend($source, {
          first_seen: <datetime>$source.first_seen,
          last_seen: <datetime>$source.last_seen,
          read_at: IF $source.read_at = NULL THEN NONE ELSE <datetime>$source.read_at END
        });
        UPSERT type::record('error_groups', $g.fingerprint) SET
          fingerprint = $g.fingerprint, fingerprint_version = 1,
          read_at = IF (count ?? 0) = 0 THEN ($g.read_at ?? NONE) ELSE (IF read_at != NONE AND $g.read_at != NONE THEN (IF read_at > $g.read_at THEN read_at ELSE $g.read_at END) ELSE NONE END) END,
          name = IF last_seen = NONE OR last_seen <= $g.last_seen THEN $g.name ELSE name END,
          message = IF last_seen = NONE OR last_seen <= $g.last_seen THEN $g.message ELSE message END,
          route = IF last_seen = NONE OR last_seen <= $g.last_seen THEN ($g.route ?? NONE) ELSE route END,
          status_code = IF last_seen = NONE OR last_seen <= $g.last_seen THEN $g.status_code ELSE status_code END,
          level = IF last_seen = NONE OR last_seen <= $g.last_seen THEN $g.level ELSE level END,
          last_stack = IF last_seen = NONE OR last_seen <= $g.last_seen THEN ($g.last_stack ?? NONE) ELSE last_stack END,
          first_seen = IF first_seen = NONE OR first_seen > $g.first_seen THEN $g.first_seen ELSE first_seen END,
          last_seen = IF last_seen = NONE OR last_seen < $g.last_seen THEN $g.last_seen ELSE last_seen END,
          count = (count ?? 0) + $g.count RETURN NONE;`)
    }
    for (const [index, row] of rows.entries()) {
      params[`r${index}`] = row.id
      params[`f${index}`] = occurrenceFingerprint(row)
      sql.push(`UPDATE $r${index} SET fingerprint = $f${index} RETURN NONE;`)
    }
    sql.push('COMMIT TRANSACTION;')
    // Fingerprint assignment and contribution commit atomically: after a crash,
    // already-contributed rows are excluded, preserving concurrent live counts
    // (including suppressed occurrences which cannot be recounted from rows).
    await queryDb(db, sql.join('\n'), params, { label: 'error groups backfill commit page', timeoutMs: 30_000, retryOnReconnect: false })
    migrated += rows.length
    const last = rows.at(-1)!
    const rawId = last.id as { id?: unknown }
    const id = rawId?.id ?? stringifyRecordId(last.id).slice('error_logs:'.length).replace(/^⟨(.*)⟩$/, '$1')
    if (typeof id !== 'string' && typeof id !== 'number' && typeof id !== 'bigint') throw new Error('Unsupported error backfill record ID')
    cursor = { timestamp: timestamp(last.timestamp), id }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const groups = Number(firstRow<{ total: number }>(await queryDb(db, 'SELECT count() AS total FROM error_groups GROUP ALL;', undefined, { label: 'error groups backfill count', timeoutMs: 10_000, retryOnReconnect: false }))?.total ?? 0)
  await queryDb(db, `UPSERT type::record('app_settings', $key) CONTENT { key: $key, value: $value, updated_at: time::now() } RETURN NONE;`,
    { key: ERROR_GROUP_BACKFILL_KEY, value: { finished_at: new Date().toISOString(), migrated, groups } }, { label: 'error groups backfill marker', timeoutMs: 10_000, retryOnReconnect: false })
  return { migrated, groups }
}
