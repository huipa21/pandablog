import { z } from 'zod'
import { queryDb, useDb } from './db'
import { firstRow, queryRows } from './surrealResult'
import { normalizeMessage } from './error-fingerprint'
import type { ListLogsResult } from './logging-admin'

export const errorFingerprintSchema = z.string().regex(/^[a-f0-9]{16}$/)
const groupIdSchema = z.string().transform(value => value.replace(/^error_groups:(?:⟨([a-f0-9]{16})⟩|([a-f0-9]{16}))$/, '$1$2')).pipe(errorFingerprintSchema)
export const bulkErrorGroupsSchema = z.object({
  action: z.enum(['mark_read', 'mark_unread', 'resolve', 'unresolve', 'delete']),
  ids: z.array(groupIdSchema).min(1).max(200)
}).strict()
export const errorGroupListSchema = z.object({
  status: z.enum(['unread', 'read', 'resolved', 'all']).default('unread'),
  search: z.string().trim().max(200).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  sort: z.enum(['last_seen', 'count', 'first_seen']).default('last_seen'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0)
}).strict().refine(value => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to), 'Invalid date range')

export async function listErrorGroups(input: z.infer<typeof errorGroupListSchema>): Promise<Omit<ListLogsResult, 'sort'> & { sort: typeof input.sort }> {
  const where: string[] = []
  if (input.status === 'unread') where.push('resolved_at = NONE AND read_at = NONE')
  if (input.status === 'read') where.push('resolved_at = NONE AND read_at != NONE')
  if (input.status === 'resolved') where.push('resolved_at != NONE')
  if (input.search) where.push('(string::lowercase(message) CONTAINS string::lowercase($search) OR string::lowercase(route ?? "") CONTAINS string::lowercase($search))')
  if (input.from) where.push('last_seen >= <datetime>$from')
  if (input.to) where.push('last_seen <= <datetime>$to')
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : ''
  // Only a zod enum reaches this literal; datetime sorts bypass the known 3.2 index-ordering defect.
  const response = await queryDb(await useDb(),
    `SELECT * FROM error_groups WITH NOINDEX ${filter} ORDER BY ${input.sort} DESC, id ASC LIMIT $limit START $offset;
     SELECT count() AS total FROM error_groups ${filter} GROUP ALL;`, input,
    { label: 'list error groups', timeoutMs: 15_000 })
  return { rows: queryRows<Record<string, unknown>>(response).map(row => ({ ...row, normalized_message: normalizeMessage(String(row.message)) })), total: Number(firstRow<{ total: number }>(response, 1)?.total ?? 0), limit: input.limit, offset: input.offset, sort: input.sort }
}

export async function readErrorGroup(fp: string) {
  const response = await queryDb(await useDb(),
    `SELECT * FROM type::record('error_groups', $fp);
     SELECT * FROM error_logs WITH NOINDEX WHERE fingerprint = $fp ORDER BY timestamp DESC, id DESC LIMIT 50;`,
    { fp }, { label: 'read error group', timeoutMs: 10_000 })
  const group = firstRow<Record<string, unknown>>(response)
  return group ? { group, occurrences: queryRows<Record<string, unknown>>(response, 1) } : null
}

/** Bounded deletes, including the final group deletion in the same transaction.
 * A temporary occurrence overflow is allowed; no deleted row bodies are loaded. */
export async function deleteErrorGroupsByFingerprints(fingerprints: string[], cutoff?: Date) {
  const fps = [...new Set(fingerprints.map(fp => errorFingerprintSchema.parse(fp)))]
  if (!fps.length) return { groups: 0, occurrences: 0, ids: [] as string[] }
  const db = await useDb()
  let occurrences = 0
  for (;;) {
    const response = await queryDb(db,
      `BEGIN TRANSACTION;
       LET $targets = IF $cutoff = NULL THEN $fps ELSE array::flatten([(SELECT VALUE fingerprint FROM error_groups WHERE fingerprint IN $fps AND last_seen < $cutoff)]) END;
       LET $ids = (SELECT VALUE id FROM error_logs WHERE fingerprint IN $targets LIMIT 2000);
       LET $groups = IF array::len($ids) < 2000 THEN (SELECT VALUE fingerprint FROM error_groups WHERE fingerprint IN $targets) ELSE [] END;
       DELETE $ids RETURN NONE;
       IF array::len($ids) < 2000 { DELETE error_groups WHERE fingerprint IN $targets RETURN NONE; };
       COMMIT TRANSACTION;
       RETURN { occurrences: array::len($ids), ids: array::flatten([$groups]) };`,
      { fps, cutoff: cutoff ?? null }, { label: 'delete error groups and occurrences', timeoutMs: 30_000, retryOnReconnect: false })
    const result = response.at(-1) as { occurrences: number; ids: string[] }
    if (!result || !Number.isInteger(result.occurrences) || result.occurrences < 0 || result.occurrences > 2000 || !Array.isArray(result.ids)) throw new Error('Invalid error group deletion result')
    occurrences += result.occurrences
    if (result.occurrences < 2000) return { groups: result.ids.length, occurrences, ids: result.ids }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

export async function bulkErrorGroups(input: z.infer<typeof bulkErrorGroupsSchema>) {
  const ids = [...new Set(input.ids)]
  if (input.action === 'delete') {
    const deleted = await deleteErrorGroupsByFingerprints(ids)
    return { ok: true, action: input.action, deleted: deleted.groups, deleted_ids: deleted.ids, deleted_occurrences: deleted.occurrences }
  }
  const assignments = {
    mark_read: 'read_at = time::now()', mark_unread: 'read_at = NONE',
    resolve: 'resolved_at = time::now(), read_at = time::now(), regressed = false',
    unresolve: 'resolved_at = NONE, read_at = NONE, regressed = false'
  }
  const response = await queryDb(await useDb(), `UPDATE error_groups SET ${assignments[input.action]} WHERE fingerprint IN $ids RETURN AFTER;`,
    { ids }, { label: `error groups ${input.action}`, timeoutMs: 20_000 })
  const updatedIds = queryRows<Record<string, unknown>>(response).map(row => String(row.fingerprint))
  return { ok: true, action: input.action, updated: updatedIds.length, updated_ids: updatedIds }
}

export async function retainErrorGroups(cutoff: Date, cap: number) {
  if (!Number.isInteger(cap) || cap < 1 || cap > 500) throw new Error('Invalid error occurrence cap')
  const db = await useDb()
  let groups = 0
  let occurrences = 0
  for (;;) {
    const fps = queryRows<{ fingerprint: string }>(await queryDb(db,
      'SELECT fingerprint FROM error_groups WHERE last_seen < $cutoff LIMIT 200;', { cutoff },
      { label: 'expired error groups', timeoutMs: 30_000, retryOnReconnect: false })).map(row => row.fingerprint)
    if (!fps.length) break
    const result = await deleteErrorGroupsByFingerprints(fps, cutoff)
    groups += result.groups
    occurrences += result.occurrences
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  // Keyset page the occurrence aggregates, not groups: this also trims any
  // legacy/orphaned fingerprint rows without loading all group IDs at once.
  let after = ''
  for (;;) {
    const rows = queryRows<{ fingerprint: string; total: number }>(await queryDb(db,
      `SELECT fingerprint, count() AS total FROM error_logs WHERE fingerprint != NONE AND fingerprint > $after GROUP BY fingerprint ORDER BY fingerprint ASC LIMIT 200;`,
      { after }, { label: 'error occurrence cap groups', timeoutMs: 30_000, retryOnReconnect: false }))
    if (!rows.length) break
    for (const row of rows) {
      if (row.total <= cap) continue
      // Exact count cap even for tied timestamps: select oldest IDs, rather
      // than the timestamp-only keep-latest helper's conservative tie behavior.
      let extras = row.total - cap
      while (extras > 0) {
        const batch = Math.min(2000, extras)
        const response = await queryDb(db,
          `LET $keep = (SELECT VALUE id FROM error_logs WITH NOINDEX WHERE fingerprint = $fp ORDER BY timestamp DESC, id DESC LIMIT $cap);
           LET $ids = (SELECT VALUE id FROM error_logs WITH NOINDEX WHERE fingerprint = $fp AND id NOT IN $keep ORDER BY timestamp ASC, id ASC LIMIT $batch);
           DELETE $ids RETURN NONE; RETURN array::len($ids);`,
          { fp: row.fingerprint, batch, cap }, { label: 'cap error occurrences', timeoutMs: 30_000, retryOnReconnect: false })
        const deleted = Number(response.at(-1))
        if (!Number.isInteger(deleted) || deleted < 0 || deleted > batch) throw new Error('Invalid occurrence cap deletion count')
        occurrences += deleted
        extras -= deleted
        if (!deleted) break
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    after = rows.at(-1)!.fingerprint
  }
  return { groups, occurrences }
}
