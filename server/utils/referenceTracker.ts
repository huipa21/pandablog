import type { Surreal } from 'surrealdb'
import { queryDb } from './db'
import { firstRow, recordIdPart, stringifyRecordId } from './surrealResult'
import { mediaNormalizeFileRecord } from './mediaLibrary'

export function mediaExtractReferencedHashes(...values: unknown[]) {
  const hashes = new Set<string>()

  for (const value of values) {
    collectHashes(value, hashes)
  }

  return hashes
}

export async function mediaSyncRecordReferences(db: Surreal, sourceRecordId: string, previousValues: unknown[], nextValues: unknown[]) {
  const previous = mediaExtractReferencedHashes(...previousValues)
  const next = mediaExtractReferencedHashes(...nextValues)

  for (const hash of next) {
    if (!previous.has(hash)) {
      await mediaAddFileReference(db, hash, sourceRecordId)
    }
  }

  for (const hash of previous) {
    if (!next.has(hash)) {
      await mediaRemoveFileReference(db, hash, sourceRecordId)
    }
  }
}

export async function mediaAddFileReference(db: Surreal, hash: string, sourceRecordId: string) {
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

export async function mediaRemoveFileReference(db: Surreal, hash: string, sourceRecordId: string) {
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

  const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: 'files',
    id: hash.toLowerCase()
  })
  const record = firstRow<Record<string, unknown>>(response)
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
  const decoded = decodeURIComponent(value)
  const hashes = new Set<string>()
  const mediaUrlPattern = /\/api\/media\/(?:file|thumbnail)\/(?:files:)?([a-f0-9]{64})/gi
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
