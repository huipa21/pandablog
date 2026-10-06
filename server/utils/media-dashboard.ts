import type { Surreal } from 'surrealdb'
import { queryDb } from './db'
import { mediaScope } from './media-query'
import { firstRow, queryRows } from './surrealResult'
import { serializeDate } from './content'
import type { SessionUser } from './users'

export const MEDIA_DASHBOARD_TYPES = ['image', 'video', 'audio', 'document', 'archive', 'other'] as const
export interface MediaDashboardRange {range: string, start: Date | null, end: Date}
const documents = "['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md']", archives = "['zip', 'rar', '7z', 'tar', 'gz']"
const kind = `IF is_image = true THEN 'image' ELSE IF string::starts_with(mime_type, 'video/') THEN 'video' ELSE IF string::starts_with(mime_type, 'audio/') THEN 'audio' ELSE IF string::lowercase(extension) IN ${documents} THEN 'document' ELSE IF string::lowercase(extension) IN ${archives} THEN 'archive' ELSE 'other' END`
const columns = `id, hash, string::slice(original_name, 0, 255) AS name, ${kind} AS type, size, reference_count, array::len(referenced_by) AS referenced_by_count, uploaded_at`
const orphan = 'reference_count = 0 AND referenced_by = []'
export async function mediaDashboard(db: Surreal, user: SessionUser, range: MediaDashboardRange, thresholdBytes: number) {
  if (!Number.isSafeInteger(thresholdBytes) || thresholdBytes < 0 || !Number.isFinite(range.end.getTime()) || (range.start && !Number.isFinite(range.start.getTime()))) throw new Error('Invalid media dashboard budget/range')
  const scope = mediaScope(user)
  const where = `${scope.where}${range.start ? ' AND uploaded_at >= $from AND uploaded_at <= $to' : ''}`
  const oversized = 'is_image = true AND size > $threshold'
  const select = (extra: string, order: string) => `SELECT ${columns} FROM files WITH NOINDEX WHERE ${where}${extra ? ` AND (${extra})` : ''} ORDER BY ${order}, id ASC LIMIT 10 TIMEOUT 5s;`
  const response = await queryDb(db, `SELECT count() AS total, math::sum(size) AS storage,
      math::sum(IF ${oversized} THEN 1 ELSE 0 END) AS oversized_count,
      math::sum(IF ${orphan} THEN 1 ELSE 0 END) AS orphan_count FROM files WITH NOINDEX WHERE ${where} GROUP ALL TIMEOUT 5s;
    SELECT type, count() AS count, math::sum(size) AS storage FROM (SELECT ${kind} AS type, size FROM files WITH NOINDEX WHERE ${where} TIMEOUT 5s) GROUP BY type LIMIT 6 TIMEOUT 5s;
    ${select('', 'size DESC, name ASC')}
    ${select(oversized, 'size DESC, name ASC')}
    ${select(orphan, 'uploaded_at DESC, size DESC, name ASC')}
    ${select('reference_count > 1', 'reference_count DESC, size DESC, name ASC')}`, {...scope.params, from: range.start, to: range.end, threshold: thresholdBytes}, {label: 'bounded scoped media dashboard', retry: 'readOnly', timeoutMs: 35_000})
  if (!Array.isArray(response) || response.length !== 6 || response.some(rows => !Array.isArray(rows))) throw new Error('Media dashboard unavailable')
  const totals = firstRow<{total: number, storage: number, oversized_count: number, orphan_count: number}>(response)
  const total = totals?.total ?? 0, storage = totals?.storage ?? 0
  if (![total, storage, totals?.oversized_count ?? 0, totals?.orphan_count ?? 0].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Media dashboard totals unavailable')
  const grouped = queryRows<{type: string, count: number, storage: number}>(response, 1)
  const byType = MEDIA_DASHBOARD_TYPES.map(type => ({type, count: grouped.find(row => row.type === type)?.count ?? 0, storage: grouped.find(row => row.type === type)?.storage ?? 0}))
  const items = (index: number) => queryRows<{hash: string, name: string, type: string, size: number, reference_count: number, referenced_by_count: number, uploaded_at: unknown}>(response, index).slice(0, 10).map(row => ({hash: row.hash, name: row.name, type: row.type, size: row.size, reference_count: row.reference_count, referenced_by_count: row.referenced_by_count, uploaded_at: serializeDate(row.uploaded_at) ?? ''}))
  const average = total ? Math.round(storage / total) : 0
  return {
    summary: {total_items: total, total_storage: storage, average_size: average}, by_type: byType,
    largest_files: items(2), oversized: {threshold_bytes: thresholdBytes, count: totals?.oversized_count ?? 0, files: items(3)},
    orphans: {count: totals?.orphan_count ?? 0, files: items(4)}, most_reused: items(5),
    time_insights: {range: range.range, start: range.start?.toISOString() ?? null, end: range.end.toISOString(), uploaded_items: total, uploaded_storage: storage, average_uploaded_size: average, oversized_images: totals?.oversized_count ?? 0, orphaned_uploads: totals?.orphan_count ?? 0, by_type: byType}
  }
}
