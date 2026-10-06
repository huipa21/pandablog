import type { Surreal } from 'surrealdb'
import { queryDb } from './db'
import { createError } from 'h3'
import type { SessionUser } from './users'
import { mediaScope } from './media-query'
import { queryRows, recordIdPart, stringifyRecordId } from './surrealResult'
import { mediaNormalizeFileRecord } from './mediaLibrary'
import type { PostVisibility } from '~/types/content'

const MEDIA_REFERENCE_FILE_COLUMNS = [
  'id',
  'hash',
  'referenced_by',
  'reference_count',
  'visibility',
  'storage_state'
].join(', ')

interface MediaVisibilityCascadeResult {
  madePrivate: string[]
  madePublic: string[]
}

interface MediaReferenceSyncResult {
  added: string[]
  removed: string[]
  changed: boolean
}

function mediaExtractReferencedHashes(...values: unknown[]) {
  const hashes = new Set<string>()

  for (const value of values) {
    collectHashes(value, hashes, typeof value === 'string')
  }

  return hashes
}

export async function mediaSyncRecordReferences(db: Surreal, sourceRecordId: string, previousValues: unknown[], nextValues: unknown[]): Promise<MediaReferenceSyncResult> {
  const previous = mediaExtractReferencedHashes(...previousValues)
  const next = mediaExtractReferencedHashes(...nextValues)
  const added = [...next].filter((hash) => !previous.has(hash))
  const removed = [...previous].filter((hash) => !next.has(hash))

  // Writers reserve next values before saving the source. Historical post
  // versions and failed/ambiguous saves conservatively retain reservations.
  // Never decrement a post reservation merely because the current doc changed.
  // Explicit source deletion releases all reservations.
  if (!sourceRecordId.startsWith('post:')) {
    for (const hash of removed) await mediaRemoveFileReference(db, hash, sourceRecordId)
  }

  return {
    added,
    removed,
    changed: Boolean(added.length || removed.length)
  }
}

export async function mediaCascadeVisibilityForPost(
  db: Surreal,
  sourceRecordId: string,
  postVisibility: PostVisibility,
  referencedValues: unknown[]
): Promise<MediaVisibilityCascadeResult> {
  const hashes = [...mediaExtractReferencedHashes(...referencedValues)]
  const result: MediaVisibilityCascadeResult = { madePrivate: [], madePublic: [] }

  if (!hashes.length) {
    return result
  }

  const response = await queryDb(db, `SELECT ${MEDIA_REFERENCE_FILE_COLUMNS} FROM files WHERE hash IN $hashes;`, { hashes })
  const files = queryRows<Record<string, unknown>>(response).map(mediaNormalizeFileRecord)
  const normalizedSource = normalizeSourceRecordId(sourceRecordId)
  const restrictedPost = isRestrictedPostVisibility(postVisibility)
  const publicCandidates: Array<{ hash: string, otherPostReferences: string[] }> = []

  for (const file of files) {
    const otherPostReferences = uniquePostReferences(file.referenced_by ?? [], normalizedSource.full)

    if (restrictedPost) {
      if (file.visibility === 'public' && otherPostReferences.length === 0) {
        result.madePrivate.push(file.hash)
      }
      continue
    }

    if (file.visibility !== 'private') {
      continue
    }

    if (otherPostReferences.length === 0) {
      result.madePublic.push(file.hash)
    } else {
      publicCandidates.push({ hash: file.hash, otherPostReferences })
    }
  }

  if (!restrictedPost && publicCandidates.length) {
    const postVisibilities = await readPostVisibilities(db, publicCandidates.flatMap((candidate) => candidate.otherPostReferences))

    for (const candidate of publicCandidates) {
      const hasRestrictedReference = candidate.otherPostReferences.some((postId) => isRestrictedPostVisibility(postVisibilities.get(postId) ?? 'private'))

      if (!hasRestrictedReference) {
        result.madePublic.push(candidate.hash)
      }
    }
  }

  await updateFileVisibility(db, result.madePrivate, 'private')
  await updateFileVisibility(db, result.madePublic, 'public')

  return result
}

export async function mediaRemoveAllReferencesForSource(db: Surreal, sourceRecordId: string) {
  const source = normalizeSourceRecordId(sourceRecordId)
  for (let batch = 0; batch < 100; batch++) {
    const rows = queryRows<{id: unknown}>(await queryDb(db, `SELECT id FROM files WHERE referenced_by CONTAINS type::record($source_table, $source_id) LIMIT 100 TIMEOUT 5s;`, {source_table: source.table, source_id: source.id}, {retry: 'never'}))
    if (!rows.length) return
    await queryDb(db, `UPDATE files SET referenced_by = array::complement(referenced_by, [type::record($source_table, $source_id)]), reference_count = array::len(array::complement(referenced_by, [type::record($source_table, $source_id)])), updated_at = time::now() WHERE id IN $ids AND (storage_state = NONE OR storage_state = 'ready') RETURN NONE;`, {ids: rows.map(row => row.id), source_table: source.table, source_id: source.id}, {retry: 'never'})
  }
  throw new Error('Media source release checkpoint budget reached; reservations retained')
}

export async function mediaReserveReferences(db: Surreal, sourceRecordId: string, values: unknown[], user?: SessionUser) {
  const hashes = [...mediaExtractReferencedHashes(...values)]
  if (!hashes.length) return
  if (hashes.length > 200) throw createError({statusCode: 400, message: 'Too many media references'})
  const source = normalizeSourceRecordId(sourceRecordId), scope = mediaScope(user)
  try {
    await queryDb(db, `BEGIN TRANSACTION;
      LET $reserved = UPDATE files SET referenced_by = array::union(referenced_by, [type::record($source_table, $source_id)]), reference_count = array::len(array::union(referenced_by, [type::record($source_table, $source_id)])), updated_at = time::now()
        WHERE hash IN $hashes AND ${scope.where} AND array::len(referenced_by) <= 2000 AND (array::len(referenced_by) < 2000 OR referenced_by CONTAINS type::record($source_table, $source_id)) RETURN id;
      IF array::len($reserved) != array::len($hashes) { THROW 'Media reference unavailable'; };
      RETURN array::len($reserved);
      COMMIT TRANSACTION;`, {...scope.params, hashes, source_table: source.table, source_id: source.id}, {retry: 'never'})
  } catch (error) {
    if (error instanceof Error && error.message === 'Media reference unavailable') throw createError({statusCode: 409, message: 'Media reference unavailable'})
    throw error // Never replay ambiguous execution or assume rollback.
  }
}
async function mediaRemoveFileReference(db: Surreal, hash: string, sourceRecordId: string) {
  const source = normalizeSourceRecordId(sourceRecordId)
  await queryDb(db, `UPDATE type::record('files', $hash) SET referenced_by = array::complement(referenced_by, [type::record($source_table, $source_id)]), reference_count = array::len(array::complement(referenced_by, [type::record($source_table, $source_id)])), updated_at = time::now() WHERE storage_state = NONE OR storage_state = 'ready' RETURN NONE;`, {hash, source_table: source.table, source_id: source.id}, {retry: 'never'})
}

async function readPostVisibilities(db: Surreal, postRecordIds: string[]) {
  const uniqueIds = [...new Set(postRecordIds)]
  const params: Record<string, unknown> = {}
  const expressions = uniqueIds.map((postRecordId, index) => {
    const source = normalizeSourceRecordId(postRecordId)
    params[`post_table_${index}`] = source.table
    params[`post_id_${index}`] = source.id
    return `type::record($post_table_${index}, $post_id_${index})`
  })
  const visibilities = new Map<string, PostVisibility>()

  if (!expressions.length) {
    return visibilities
  }

  const response = await queryDb(db, `SELECT id, visibility FROM post WHERE id IN [${expressions.join(', ')}];`, params)

  for (const row of queryRows<Record<string, unknown>>(response)) {
    visibilities.set(stringifyRecordId(row.id), normalizePostVisibility(row.visibility))
  }

  return visibilities
}

async function updateFileVisibility(db: Surreal, hashes: string[], visibility: 'public' | 'private') {
  const uniqueHashes = [...new Set(hashes)]

  if (!uniqueHashes.length) {
    return
  }

  await queryDb(
    db,
    "UPDATE files SET visibility = $visibility, updated_at = time::now() WHERE hash IN $hashes AND (storage_state = NONE OR storage_state = 'ready');",
    { visibility, hashes: uniqueHashes }
  )
}

function uniquePostReferences(references: string[], currentPostRecordId: string) {
  return [...new Set(references)]
    .map((reference) => stringifyRecordId(reference))
    .filter((reference) => reference !== currentPostRecordId && reference.startsWith('post:'))
}

function isRestrictedPostVisibility(visibility: PostVisibility) {
  return visibility === 'private' || visibility === 'password'
}

function normalizePostVisibility(value: unknown): PostVisibility {
  if (value === 'private' || value === 'password') return value
  return 'public'
}

function collectHashes(value: unknown, hashes: Set<string>, bareHash = false) {
  if (typeof value === 'string') {
    for (const hash of parseHashesFromString(value, bareHash)) {
      hashes.add(hash)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectHashes(item, hashes, false))
    return
  }

  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => collectHashes(entry, hashes, key === 'mediaHash' || key === 'fileHash'))
  }
}

function parseHashesFromString(value: string, bareHash: boolean) {
  let decoded = value
  // Match recordIdPart/media serving's bounded double-decode contract.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next}
    catch {break}
  }
  const hashes = new Set<string>()
  const mediaUrlPattern = /(?:\/media\/|\/api\/media\/(?:file|thumbnail|variant\/(?:thumbnail|medium|large))\/)(?:files:)?([a-f0-9]{64})/gi
  const recordPattern = /\bfiles:([a-f0-9]{64})\b/gi
  const storagePattern = /^\/?(?:(?:storage\/(?:uploads|variants)\/)?(?:thumbnail\/|medium\/|large\/)?\d{4}\/\d{2}\/)([a-f0-9]{64})(?:\.[a-z0-9]+)?(?:$|[?#])/gi
  // Bare hashes are allowed only for explicit cover/avatar root values or
  // named mediaHash/fileHash fields, never document text/block content IDs.
  if (bareHash && /^[a-f0-9]{64}(?:\.[a-z0-9]+)?$/i.test(decoded)) hashes.add(decoded.slice(0, 64).toLowerCase())

  for (const pattern of [mediaUrlPattern, recordPattern, storagePattern]) {
    let match = pattern.exec(decoded)

    while (match) {
      hashes.add(String(match[1]).toLowerCase())
      if (hashes.size > 200) throw createError({statusCode: 400, message: 'Too many media references'})
      match = pattern.exec(decoded)
    }
  }

  return hashes
}

function normalizeSourceRecordId(sourceRecordId: string) {
  const normalized = stringifyRecordId(sourceRecordId)
  const separatorIndex = normalized.indexOf(':')

  if (separatorIndex <= 0) {
    throw createError({ statusCode: 400, message: 'Source record id must include a table prefix' })
  }

  const table = normalized.slice(0, separatorIndex)
  const id = recordIdPart(normalized.slice(separatorIndex + 1), table)

  return {
    table,
    id,
    full: `${table}:${id}`
  }
}
