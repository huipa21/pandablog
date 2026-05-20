import type { Surreal } from 'surrealdb'
import { mediaHashBuffer } from './fileHash'
import { mediaDeleteStoredObjects, mediaDeleteThumbnailPath, mediaStoredFilename, mediaUploadRelativePath, mediaWriteUploadBuffer } from './fileStorage'
import { mediaProcessImageBuffer } from './imageProcessor'
import { isSimilar } from './imageHash'
import { queryDb } from './db'
import { slugify, serializeDate } from './content'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from './surrealResult'
import { getExpectedMimeType, getExtension, validateUpload } from './validateUpload'
import type { MediaSettings } from './settings'
import type { MediaFolderRecord, MediaRecord, UploadFileResult } from '~/types/content'

export interface MediaCreateUploadInput {
  originalName: string
  data: Buffer
  mimeType?: string
  uploadedBy?: string
}

export interface MediaSearchOptions {
  page?: number
  limit?: number
  search?: string
  type?: string
  mime_type?: string
  folder?: string
  tag?: string
  uploaded_from?: string
  uploaded_to?: string
  orphan?: boolean
}

export function mediaNormalizeFileRecord(record: Record<string, unknown>): MediaRecord {
  const hash = String(record.hash ?? recordIdPart(stringifyRecordId(record.id), 'files'))
  const imageMeta = normalizeObject(record.image_meta)
  const width = numberOrNull(imageMeta?.width ?? record.width)
  const height = numberOrNull(imageMeta?.height ?? record.height)
  const uploadedAt = serializeDate(record.uploaded_at ?? record.created_at) ?? new Date().toISOString()
  const updatedAt = serializeDate(record.updated_at) ?? uploadedAt
  const storagePath = String(record.storage_path ?? record.path ?? '')
  const thumbnailPath = stringOrNull(record.thumbnail_path)

  return {
    id: stringifyRecordId(record.id),
    hash,
    original_name: String(record.original_name ?? ''),
    stored_name: String(record.stored_name ?? mediaStoredFilename(hash, String(record.extension ?? ''))),
    extension: String(record.extension ?? ''),
    mime_type: String(record.mime_type ?? ''),
    size: Number(record.size ?? 0),
    path: storagePath,
    storage_path: storagePath,
    url: `/api/media/file/${encodeURIComponent(hash)}`,
    thumbnail_path: thumbnailPath,
    thumbnail_url: thumbnailPath ? `/api/media/thumbnail/${encodeURIComponent(hash)}` : null,
    width,
    height,
    is_image: Boolean(record.is_image),
    image_meta: imageMeta,
    folders: normalizeRecordIdArray(record.folders),
    tags: normalizeStringArray(record.tags),
    comment: stringOrNull(record.comment),
    reference_count: Number(record.reference_count ?? 0),
    referenced_by: normalizeRecordIdArray(record.referenced_by),
    perceptual_hash: stringOrNull(record.perceptual_hash),
    created_at: uploadedAt,
    uploaded_at: uploadedAt,
    updated_at: updatedAt
  }
}

export function mediaNormalizeFolderRecord(record: Record<string, unknown>): MediaFolderRecord {
  const createdAt = serializeDate(record.created_at) ?? new Date().toISOString()

  return {
    id: stringifyRecordId(record.id),
    name: String(record.name ?? ''),
    slug: String(record.slug ?? ''),
    parent: record.parent ? stringifyRecordId(record.parent) : null,
    created_at: createdAt,
    updated_at: serializeDate(record.updated_at) ?? createdAt
  }
}

export async function mediaCreateOrReuseFileRecord(db: Surreal, input: MediaCreateUploadInput, settings: MediaSettings): Promise<UploadFileResult> {
  const originalName = input.originalName || 'upload'
  const extension = getExtension(originalName).toLowerCase()
  const mimeType = normalizeUploadMimeType(input.mimeType, extension)
  const validation = validateUpload(originalName, input.data.length, mimeType, settings)

  if (!validation.valid) {
    return {
      original_name: originalName,
      extension,
      status: 'rejected',
      reason: validation.reason
    }
  }

  const hash = mediaHashBuffer(input.data)
  const existing = await mediaReadFileByHash(db, hash)

  if (existing) {
    const updated = await mediaIncrementDuplicateUpload(db, existing)
    return {
      original_name: originalName,
      extension,
      status: 'duplicate',
      record: updated
    }
  }

  const image = await mediaProcessImageBuffer(input.data, hash, mimeType, settings.enable_perceptual_dedup)

  if (image.perceptual_hash && settings.enable_perceptual_dedup) {
    const similar = await mediaFindSimilarImage(db, image.perceptual_hash, settings.perceptual_dedup_threshold)

    if (similar) {
      await mediaDeleteThumbnailPath(image.thumbnail_path)
      return {
        original_name: originalName,
        extension,
        status: 'similar',
        similar_to: similar
      }
    }
  }

  let storagePath = ''

  try {
    storagePath = await mediaWriteUploadBuffer(hash, extension, input.data)
    const now = new Date()
    const createResponse = await queryDb(
      db,
      `CREATE type::record($table, $id) CONTENT {
        hash: $hash,
        original_name: $original_name,
        stored_name: $stored_name,
        mime_type: $mime_type,
        size: $size,
        extension: $extension,
        uploaded_at: $now,
        updated_at: $now,
        comment: NONE,
        is_image: $is_image,
        image_meta: $image_meta,
        folders: [],
        tags: [],
        reference_count: 0,
        referenced_by: [],
        storage_path: $storage_path,
        thumbnail_path: $thumbnail_path,
        perceptual_hash: $perceptual_hash,
        uploaded_by: $uploaded_by
      };`,
      {
        table: 'files',
        id: hash,
        hash,
        original_name: originalName,
        stored_name: mediaStoredFilename(hash, extension),
        mime_type: mimeType,
        size: input.data.length,
        extension,
        now,
        is_image: image.is_image,
        image_meta: image.image_meta,
        storage_path: storagePath,
        thumbnail_path: image.thumbnail_path,
        perceptual_hash: image.perceptual_hash,
        uploaded_by: input.uploadedBy ?? null
      }
    )
    const created = firstRow<Record<string, unknown>>(createResponse)

    if (!created) {
      throw createError({ statusCode: 500, message: 'File record was not created' })
    }

    return {
      original_name: originalName,
      extension,
      status: 'created',
      record: mediaNormalizeFileRecord(created)
    }
  } catch (error) {
    await mediaDeleteStoredObjects({ storage_path: storagePath || mediaUploadRelativePath(hash, extension), thumbnail_path: image.thumbnail_path })
    throw error
  }
}

export async function mediaReadFileByHash(db: Surreal, hash: string) {
  const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: 'files',
    id: recordIdPart(hash, 'files')
  })
  const record = firstRow<Record<string, unknown>>(response)
  return record ? mediaNormalizeFileRecord(record) : null
}

export async function mediaFindSimilarImage(db: Surreal, perceptualHash: string, threshold: number) {
  const response = await queryDb(db, 'SELECT * FROM files WHERE perceptual_hash != NONE;')

  for (const record of queryRows<Record<string, unknown>>(response)) {
    const file = mediaNormalizeFileRecord(record)

    if (file.perceptual_hash && isSimilar(perceptualHash, file.perceptual_hash, threshold)) {
      return file
    }
  }

  return null
}

export async function mediaSearchFileRecords(db: Surreal, options: MediaSearchOptions) {
  const page = Math.max(1, Number(options.page || 1))
  const limit = Math.max(1, Math.min(100, Number(options.limit || 24)))
  const offset = (page - 1) * limit
  const params: Record<string, unknown> = { limit, offset }
  const conditions: string[] = []
  const search = String(options.search || '').trim()

  if (search) {
    conditions.push('(original_name ~* $search OR comment ~* $search)')
    params.search = search
  }

  if (options.type && options.type !== 'all') {
    const typeCondition = mediaTypeCondition(options.type)
    if (typeCondition) {
      conditions.push(typeCondition)
    }
  }

  if (options.mime_type) {
    conditions.push('mime_type = $mime_type')
    params.mime_type = options.mime_type
  }

  if (options.folder) {
    conditions.push('folders CONTAINS type::record($folder_table, $folder_id)')
    params.folder_table = 'folder'
    params.folder_id = mediaNormalizeFolderId(options.folder)
  }

  if (options.tag) {
    conditions.push('tags CONTAINS $tag')
    params.tag = options.tag
  }

  if (options.uploaded_from) {
    conditions.push('uploaded_at >= $uploaded_from')
    params.uploaded_from = new Date(options.uploaded_from)
  }

  if (options.uploaded_to) {
    conditions.push('uploaded_at <= $uploaded_to')
    params.uploaded_to = new Date(options.uploaded_to)
  }

  if (options.orphan) {
    conditions.push('reference_count = 0 AND referenced_by = []')
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const countResponse = await queryDb(db, `SELECT count() AS total FROM files ${whereClause};`, params)
  const total = Number(firstRow<{ total?: number }>(countResponse)?.total ?? 0)
  const response = await queryDb(db, `SELECT * FROM files ${whereClause} ORDER BY uploaded_at DESC LIMIT $limit START $offset;`, params)
  const files = queryRows<Record<string, unknown>>(response).map(mediaNormalizeFileRecord)

  return {
    files,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  }
}

export async function mediaUniqueFolderSlug(db: Surreal, desired: string, currentRecordId?: string) {
  const base = slugify(desired)

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
    const response = await queryDb(db, 'SELECT id FROM folder WHERE slug = $slug LIMIT 1;', { slug: candidate })
    const existing = firstRow<{ id: unknown }>(response)

    if (!existing) {
      return candidate
    }

    if (currentRecordId && stringifyRecordId(existing.id) === currentRecordId) {
      return candidate
    }
  }

  return `${base}-${Date.now()}`
}

export function mediaCleanFolderName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''

  if (!name) {
    throw createError({ statusCode: 400, message: 'Folder name is required' })
  }

  return name.slice(0, 120)
}

export function mediaNormalizeHash(value: string) {
  const hash = recordIdPart(value, 'files').trim()

  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw createError({ statusCode: 400, message: 'Invalid file id' })
  }

  return hash.toLowerCase()
}

export function mediaNormalizeFolderId(value: string) {
  const id = recordIdPart(value, 'folder').trim()

  if (!id) {
    throw createError({ statusCode: 400, message: 'Invalid folder id' })
  }

  return id
}

async function mediaIncrementDuplicateUpload(db: Surreal, existing: MediaRecord) {
  const referenceCount = Math.max(0, Number(existing.reference_count ?? 0)) + 1
  const response = await queryDb(
    db,
    'UPDATE type::record($table, $id) MERGE { reference_count: $reference_count, updated_at: time::now() } RETURN AFTER;',
    {
      table: 'files',
      id: existing.hash,
      reference_count: referenceCount
    }
  )
  const updated = firstRow<Record<string, unknown>>(response)
  return updated ? mediaNormalizeFileRecord(updated) : existing
}

function normalizeUploadMimeType(mimeType: string | undefined, extension: string) {
  const reported = typeof mimeType === 'string' ? mimeType.trim() : ''

  if (reported && reported !== 'application/octet-stream') {
    return reported
  }

  return getExpectedMimeType(extension) ?? 'application/octet-stream'
}

function mediaTypeCondition(type: string) {
  switch (type) {
    case 'image':
      return 'is_image = true'
    case 'video':
      return "mime_type ~ '^video/'"
    case 'document':
      return "extension IN ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md']"
    case 'archive':
      return "extension IN ['zip', 'rar', '7z', 'tar', 'gz']"
    case 'other':
      return "is_image = false AND extension NOT IN ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'zip', 'rar', '7z', 'tar', 'gz']"
    default:
      return ''
  }
}

function normalizeRecordIdArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((entry) => stringifyRecordId(entry)).filter(Boolean)
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)))
}

function normalizeObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}
