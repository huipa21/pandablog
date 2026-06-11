import type { Surreal } from 'surrealdb'
import { queryDb, queryDbRecord } from './db'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from './surrealResult'
import { mediaNormalizeFileRecord } from './mediaLibrary'
import type { PostVisibility } from '~/types/content'

const MEDIA_REFERENCE_FILE_COLUMNS = [
  'id',
  'hash',
  'referenced_by',
  'reference_count',
  'visibility'
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
    collectHashes(value, hashes)
  }

  return hashes
}

export async function mediaSyncRecordReferences(db: Surreal, sourceRecordId: string, previousValues: unknown[], nextValues: unknown[]): Promise<MediaReferenceSyncResult> {
  const previous = mediaExtractReferencedHashes(...previousValues)
  const next = mediaExtractReferencedHashes(...nextValues)
  const added = [...next].filter((hash) => !previous.has(hash))
  const removed = [...previous].filter((hash) => !next.has(hash))

  for (const hash of added) {
    await mediaAddFileReference(db, hash, sourceRecordId)
  }

  for (const hash of removed) {
    await mediaRemoveFileReference(db, hash, sourceRecordId)
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
  const response = await queryDb(
    db,
    `SELECT ${MEDIA_REFERENCE_FILE_COLUMNS} FROM files WHERE referenced_by CONTAINS type::record($source_table, $source_id);`,
    {
      source_table: source.table,
      source_id: source.id
    }
  )

  for (const record of queryRows<Record<string, unknown>>(response)) {
    const file = mediaNormalizeFileRecord(record)
    const references = new Set(file.referenced_by ?? [])

    if (!references.delete(source.full)) {
      continue
    }

    await writeFileReferences(db, file.hash, [...references], Math.max(0, (file.reference_count ?? 0) - 1))
  }
}

async function mediaAddFileReference(db: Surreal, hash: string, sourceRecordId: string) {
  const file = await readFileForReference(db, hash)

  if (!file) {
    return
  }

  const normalizedSource = normalizeSourceRecordId(sourceRecordId)
  const references = new Set(file.referenced_by ?? [])

  if (references.has(normalizedSource.full)) {
    return
  }

  references.add(normalizedSource.full)
  await writeFileReferences(db, file.hash, [...references], Math.max(0, file.reference_count ?? 0) + 1)
}

async function mediaRemoveFileReference(db: Surreal, hash: string, sourceRecordId: string) {
  const file = await readFileForReference(db, hash)

  if (!file) {
    return
  }

  const normalizedSource = normalizeSourceRecordId(sourceRecordId)
  const references = new Set(file.referenced_by ?? [])

  if (!references.delete(normalizedSource.full)) {
    return
  }

  await writeFileReferences(db, file.hash, [...references], Math.max(0, (file.reference_count ?? 0) - 1))
}

async function readFileForReference(db: Surreal, hash: string) {
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return null
  }

  const record = await queryDbRecord(db, 'files', hash.toLowerCase())
  return record ? mediaNormalizeFileRecord(record) : null
}

async function writeFileReferences(db: Surreal, hash: string, references: string[], referenceCount: number) {
  const params: Record<string, unknown> = {
    table: 'files',
    id: hash,
    reference_count: referenceCount
  }
  const referenceExpressions = references.map((reference, index) => {
    const source = normalizeSourceRecordId(reference)
    params[`reference_table_${index}`] = source.table
    params[`reference_id_${index}`] = source.id
    return `type::record($reference_table_${index}, $reference_id_${index})`
  })

  await queryDb(
    db,
    `UPDATE type::record($table, $id) SET referenced_by = [${referenceExpressions.join(', ')}], reference_count = $reference_count, updated_at = time::now() RETURN AFTER;`,
    params
  )
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
    'UPDATE files SET visibility = $visibility, updated_at = time::now() WHERE hash IN $hashes;',
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

function collectHashes(value: unknown, hashes: Set<string>) {
  if (typeof value === 'string') {
    for (const hash of parseHashesFromString(value)) {
      hashes.add(hash)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectHashes(item, hashes))
    return
  }

  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectHashes(entry, hashes))
  }
}

function parseHashesFromString(value: string) {
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // If decodeURIComponent fails (malformed URI), use the value as-is
    decoded = value
  }
  const hashes = new Set<string>()
  const mediaUrlPattern = /\/api\/media\/(?:file|thumbnail|variant\/(?:thumbnail|medium|large))\/(?:files:)?([a-f0-9]{64})/gi
  const recordPattern = /\bfiles:([a-f0-9]{64})\b/gi
  const storagePattern = /(?:^|[\/\\])([a-f0-9]{64})(?:\.[a-z0-9]+)?(?:$|[?#])/gi

  for (const pattern of [mediaUrlPattern, recordPattern, storagePattern]) {
    let match = pattern.exec(decoded)

    while (match) {
      hashes.add(String(match[1]).toLowerCase())
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
