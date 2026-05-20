import type { Surreal } from 'surrealdb'
import { queryDb } from './db'
import { mediaDeleteStoredObjects } from './fileStorage'
import { mediaNormalizeFileRecord } from './mediaLibrary'
import { queryRows } from './surrealResult'
import type { MediaRecord } from '~/types/content'

export interface MediaCleanupOptions {
  olderThanDays?: number
  hashes?: string[]
}

export async function mediaListOrphanFiles(db: Surreal, olderThanDays?: number) {
  const params: Record<string, unknown> = {}
  const conditions = ['reference_count = 0', 'referenced_by = []']

  if (typeof olderThanDays === 'number' && olderThanDays > 0) {
    conditions.push('uploaded_at < $before')
    params.before = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
  }

  const response = await queryDb(
    db,
    `SELECT * FROM files WHERE ${conditions.join(' AND ')} ORDER BY uploaded_at DESC;`,
    params,
    { timeoutMs: 30_000 }
  )

  return queryRows<Record<string, unknown>>(response).map(mediaNormalizeFileRecord)
}

export async function mediaCleanupOrphanFiles(db: Surreal, options: MediaCleanupOptions = {}) {
  const wantedHashes = normalizeHashSet(options.hashes)
  const orphans = await mediaListOrphanFiles(db, options.olderThanDays)
  const selected = wantedHashes.size
    ? orphans.filter((file) => wantedHashes.has(file.hash))
    : orphans
  const deleted: MediaRecord[] = []
  const failed: Array<{ hash: string, reason: string }> = []

  for (const file of selected) {
    try {
      await mediaDeleteStoredObjects(file)
      await queryDb(db, 'DELETE FROM type::record($table, $id);', {
        table: 'files',
        id: file.hash
      })
      deleted.push(file)
    } catch (error) {
      failed.push({
        hash: file.hash,
        reason: error instanceof Error ? error.message : 'Delete failed'
      })
    }
  }

  return {
    deleted,
    failed,
    deleted_count: deleted.length,
    failed_count: failed.length
  }
}

function normalizeHashSet(values: unknown) {
  if (!Array.isArray(values)) {
    return new Set<string>()
  }

  return new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[a-f0-9]{64}$/.test(value))
  )
}
