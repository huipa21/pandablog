import { z } from 'zod'
import { createError } from 'h3'
import { BACKUP_LIMITS } from './streams'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const common = {
  id: z.string().min(1).max(128), source_id: z.string().min(1).max(128).optional(), source_note: z.string().max(2000).optional(), type: z.literal('full'),
  parent: z.null(), chain_root: z.null(), included_tables: z.null(),
  created_at: z.iso.datetime({offset: true}), note: z.string().max(500).nullable(),
  sha256_db: hash, sha256_media: hash,
  db_size_bytes: z.number().int().positive().max(BACKUP_LIMITS.compressedBytes),
  media_size_bytes: z.number().int().positive().max(BACKUP_LIMITS.mediaBytes),
  media_file_count: z.number().int().min(0).max(BACKUP_LIMITS.mediaEntries),
  included_hashes: z.array(hash).max(BACKUP_LIMITS.mediaEntries),
  excluded_tables: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).max(200),
}
export const manifestSchema = z.object({format: z.literal('pandablog-backup'), format_version: z.literal(1), ...common}).strict()
export type FullManifest = z.infer<typeof manifestSchema>

// Legacy metadata is bounded and full must be explicit. Absence of a manifest
// is a separate administrator-trusted split-import adapter, not this parser.
const legacySchema = z.object({
  ...common,
  parent: z.null().optional(), chain_root: z.null().optional(), included_tables: z.null().optional(),
  id: common.id.optional(), created_at: common.created_at.optional(), note: z.string().max(2000).nullable().optional(),
  sha256_db: hash.optional(), sha256_media: hash.optional(),
  db_size_bytes: common.db_size_bytes.optional(), media_size_bytes: common.media_size_bytes.optional(),
  media_file_count: common.media_file_count.optional(), included_hashes: common.included_hashes.optional(), excluded_tables: common.excluded_tables.optional(),
}).strict()
export function parseManifest(buffer: Buffer, versionedOnly = false) {
  if (buffer.length > BACKUP_LIMITS.manifestBytes) throw createError({statusCode: 413, message: 'Backup manifest byte budget exceeded'})
  let raw: unknown
  try {raw = JSON.parse(buffer.toString('utf8'))} catch {throw createError({statusCode: 400, message: 'Invalid backup manifest JSON'})}
  const object = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : null
  const versioned = object !== null && ('format_version' in object || 'format' in object)
  if (versioned && object.format_version !== 1) throw createError({statusCode: 400, message: 'Unsupported backup format version', data: {reason: 'unsupported-version'}})
  if (versionedOnly && !versioned) throw createError({statusCode: 400, message: 'Versioned full backup manifest required'})
  const parsed = versioned ? manifestSchema.safeParse(raw) : legacySchema.safeParse(raw)
  if (!parsed.success) throw createError({statusCode: 400, message: 'Invalid or unsupported full backup manifest'})
  return parsed.data
}
/** Old split imports allowed 2000-character notes. Preserve that bounded
 * provenance without loosening the 500-character new-format/create note. */
export function manifestNote(note: string | null) {
  return note && note.length > 500 ? {note: null, source_note: note} : {note}
}
export function parseFullManifest(buffer: Buffer): FullManifest {
  return manifestSchema.parse(parseManifest(buffer, true))
}
