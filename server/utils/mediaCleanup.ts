import type { Surreal } from 'surrealdb'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { queryDb } from './db'
import { mediaDeleteStoredObjects } from './fileStorage'
import { MEDIA_FILE_RECORD_COLUMNS, mediaNormalizeFileRecord, mediaNormalizeHash } from './mediaLibrary'
import { mediaInteger, mediaScope } from './media-query'
import { mediaPublicationAdmission } from './media-publication'
import { firstRow, queryRows } from './surrealResult'
import type { SessionUser } from './users'

export interface MediaCleanupOptions {olderThanDays?: number, hashes?: string[], user?: SessionUser, signal?: AbortSignal}
function cutoff(days?: number) {return days === undefined || days === 0 ? null : new Date(Date.now() - mediaInteger(days, 0, 0, 3650) * 86_400_000)}
export async function mediaListOrphanFiles(db: Surreal, olderThanDays?: number, user?: SessionUser, page = 1, limit = 100) {
  const scope = mediaScope(user), before = cutoff(olderThanDays)
  page = mediaInteger(page, 1, 1, 101); limit = mediaInteger(limit, 100, 1, 100)
  const response = await queryDb(db, `SELECT ${MEDIA_FILE_RECORD_COLUMNS} FROM files WITH NOINDEX WHERE ${scope.where} AND reference_count = 0 AND referenced_by = [] AND ($before = NULL OR uploaded_at < $before) ORDER BY uploaded_at DESC, id ASC LIMIT $limit START $offset TIMEOUT 5s;`, {...scope.params, before, limit, offset: (page - 1) * limit}, {retry: 'readOnly', timeoutMs: 6000})
  return queryRows<Record<string, unknown>>(response).map(mediaNormalizeFileRecord)
}
/** The same conditional DB write arbitrates cleanup vs source reservation.
 * Claims persist across disk errors/restart and disk deletion is idempotent. */
export async function mediaClaimDeletion(db: Surreal, hash: string, user?: SessionUser, olderThanDays?: number) {
  const scope = mediaScope(user, true), before = cutoff(olderThanDays)
  const claim: string = randomUUID()
  const record = firstRow<Record<string, unknown>>(await queryDb(db, `UPDATE type::record('files', $hash) SET storage_state = 'deleting', storage_claim = $claim WHERE ${scope.where} AND reference_safe = true AND reference_count = 0 AND referenced_by = [] AND ($before = NULL OR uploaded_at < $before) RETURN AFTER;`, {...scope.params, hash: mediaNormalizeHash(hash), claim, before}, {retry: 'never'}))
  return record ? {file: mediaNormalizeFileRecord(record), claim} : null
}
export async function mediaDeleteClaimedFile(db: Surreal, hash: string, user?: SessionUser, olderThanDays?: number, signal?: AbortSignal) {
  const release = await mediaPublicationAdmission.acquire(signal)
  try {
    if (signal?.aborted) throw createError({statusCode: 408, message: 'Media deletion aborted'})
    hash = mediaNormalizeHash(hash)
    let owned = await mediaClaimDeletion(db, hash, user, olderThanDays)
    if (!owned) {
      const scope = mediaScope(user, true, false)
      const retry = firstRow<Record<string, unknown>>(await queryDb(db, `SELECT * FROM files WHERE hash = $hash AND ${scope.where} AND storage_state = 'deleting' AND reference_safe = true AND reference_count = 0 AND referenced_by = [] LIMIT 1;`, {...scope.params, hash}, {retry: 'never'}))
      if (retry && typeof retry.storage_claim === 'string') owned = {file: mediaNormalizeFileRecord(retry), claim: retry.storage_claim}
    }
    if (!owned) throw createError({statusCode: 409, message: 'Media is referenced, unavailable or requires reference migration'})
    await mediaDeleteStoredObjects(owned.file)
    await queryDb(db, "DELETE files WHERE hash = $hash AND storage_state = 'deleting' AND storage_claim = $claim RETURN NONE;", {hash, claim: owned.claim}, {retry: 'never'})
  } finally {release()}
}
export async function mediaCleanupOrphanFiles(db: Surreal, options: MediaCleanupOptions = {}) {
  let hashes: string[] | undefined
  if (options.hashes !== undefined) {
    if (!Array.isArray(options.hashes) || options.hashes.length > 200) throw createError({statusCode: 400, message: 'Invalid media cleanup selection'})
    hashes = [...new Set(options.hashes.map(mediaNormalizeHash))]
    if (!hashes.length) return {deleted: [], failed: [], deleted_count: 0, failed_count: 0, incomplete: false}
  }
  const deadline = AbortSignal.timeout(30_000)
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline
  const scope = mediaScope(options.user, true), before = cutoff(options.olderThanDays)
  const response = await queryDb(db, `SELECT id, hash FROM files WITH NOINDEX WHERE ${scope.where} AND reference_safe = true AND reference_count = 0 AND referenced_by = [] AND ($before = NULL OR uploaded_at < $before) ${hashes ? 'AND hash IN $hashes' : ''} ORDER BY id LIMIT 201 TIMEOUT 5s;`, {...scope.params, before, hashes: hashes ?? []}, {retry: 'readOnly', timeoutMs: 6000})
  const rows = queryRows<{hash: string}>(response), deleted: string[] = [], failed: Array<{hash: string, reason: string}> = []
  const available = new Set(rows.map(row => row.hash))
  const unavailable = hashes?.filter(hash => !available.has(hash)) ?? []
  let failedCount = unavailable.length
  for (const hash of unavailable.slice(0, 20)) failed.push({hash, reason: 'Media unavailable or requires reference migration'})
  let attempted = 0
  for (const row of rows.slice(0, 200)) {
    if (signal.aborted) break
    attempted++
    try {await mediaDeleteClaimedFile(db, row.hash, options.user, options.olderThanDays, signal); deleted.push(row.hash)}
    catch {failedCount++; if (failed.length < 20) failed.push({hash: row.hash, reason: 'Deletion incomplete; retry or inspect recovery state'})}
  }
  return {deleted, failed, deleted_count: deleted.length, failed_count: failedCount, incomplete: attempted < rows.length || failedCount > 0}
}
