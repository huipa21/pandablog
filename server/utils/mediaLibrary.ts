import type { Surreal } from 'surrealdb'
import { mediaHashBuffer } from './fileHash'
import { mediaDeleteStoredObjects, mediaOriginalRelativePath, mediaStoredFilename, mediaWriteOriginalBuffer } from './fileStorage'
import { mediaProcessImageBuffer } from './imageProcessor'
import { isSimilar } from './imageHash'
import { findBySlug, queryDb, queryDbRecord } from './db'
import { slugify, serializeDate } from './content'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from './surrealResult'
import { getExpectedMimeType, getExtension, validateUpload } from './validateUpload'
import { mediaRecordVisibleToUser } from './mediaPermissions'
import type { MediaSettings } from './settings'
import type { SessionUser } from './users'
import type { MediaFolderRecord, MediaRecord, MediaVariantRecord, MediaVariantSize, UploadFileResult } from '~/types/content'

export const MEDIA_FILE_RECORD_COLUMNS = [
  'id',
  'hash',
  'original_name',
  'stored_name',
  'extension',
  'mime_type',
  'size',
  'original_path',
  'variants',
  'image_meta',
  'width',
  'height',
  'is_image',
  'folders',
  'tags',
  'comment',
  'reference_count',
  'referenced_by',
  'visibility',
  'created_by',
  'uploaded_by',
  'perceptual_hash',
  'created_at',
  'uploaded_at',
  'updated_at'
].join(', ')

export interface MediaCreateUploadInput {
  originalName: string
  data: Buffer
  mimeType?: string
  uploadedBy?: string
  createdBy?: string
  visibility?: 'public' | 'private'
}

export interface MediaSearchOptions {
  page?: number
  limit?: number
  search?: string
  file_name?: string
  extension?: string
  comment?: string
  tags?: string[]
  tag_relation?: 'and' | 'or'
  filename_regex?: string
  filename_regex_case_insensitive?: boolean
  search_regex?: boolean
  case_insensitive?: boolean
  sort?: string
  advanced?: MediaAdvancedGroup | null
  type?: string
  mime_type?: string
  folder?: string
  tag?: string
  uploaded_from?: string
  uploaded_to?: string
  orphan?: boolean
  visibility?: string
  visibleToUser?: SessionUser
}

export interface MediaAdvancedGroup {
  op?: 'AND' | 'OR'
  conditions?: Array<MediaAdvancedGroup | MediaAdvancedCondition>
}

export interface MediaAdvancedCondition {
  field?: string
  operator?: string
  value?: string
  valueTo?: string
  caseInsensitive?: boolean
}

export function mediaNormalizeFileRecord(record: Record<string, unknown>): MediaRecord {
  const hash = String(record.hash ?? recordIdPart(stringifyRecordId(record.id), 'files'))
  const imageMeta = normalizeObject(record.image_meta)
  const variants = normalizeVariants(record.variants, hash)
  const width = numberOrNull(imageMeta?.width ?? variants?.large?.width ?? variants?.medium?.width ?? record.width)
  const height = numberOrNull(imageMeta?.height ?? variants?.large?.height ?? variants?.medium?.height ?? record.height)
  const uploadedAt = serializeDate(record.uploaded_at ?? record.created_at) ?? new Date().toISOString()
  const updatedAt = serializeDate(record.updated_at) ?? uploadedAt
  const originalPath = String(record.original_path ?? '')

  return {
    id: stringifyRecordId(record.id),
    hash,
    original_name: String(record.original_name ?? ''),
    stored_name: String(record.stored_name ?? mediaStoredFilename(hash, String(record.extension ?? ''))),
    extension: String(record.extension ?? ''),
    mime_type: String(record.mime_type ?? ''),
    size: Number(record.size ?? 0),
    original_path: originalPath,
    url: `/api/media/file/${encodeURIComponent(hash)}`,
    variants,
    thumbnail_url: variants?.thumbnail?.url ?? null,
    width,
    height,
    is_image: Boolean(record.is_image),
    image_meta: imageMeta,
    folders: normalizeRecordIdArray(record.folders),
    tags: normalizeStringArray(record.tags),
    comment: stringOrNull(record.comment),
    reference_count: Number(record.reference_count ?? 0),
    referenced_by: normalizeRecordIdArray(record.referenced_by),
    visibility: record.visibility === 'private' ? 'private' : 'public',
    created_by: record.created_by ? stringifyRecordId(record.created_by) : null,
    uploaded_by: stringOrNull(record.uploaded_by),
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

  const createdAt = new Date()
  const image = await mediaProcessImageBuffer(input.data, hash, mimeType, settings.enable_perceptual_dedup, createdAt)

  if (image.perceptual_hash && settings.enable_perceptual_dedup) {
    const similar = await mediaFindSimilarImage(db, image.perceptual_hash, settings.perceptual_dedup_threshold)

    if (similar) {
      await mediaDeleteStoredObjects({ original_path: null, variants: image.variants ?? null })
      return {
        original_name: originalName,
        extension,
        status: 'similar',
        similar_to: similar
      }
    }
  }

  let originalPath = ''

  try {
    originalPath = await mediaWriteOriginalBuffer(hash, extension, input.data, createdAt)
    const now = createdAt
    const imageMetaExpression = optionalParamExpression(image.image_meta, 'image_meta')
    const variantsExpression = optionalParamExpression(image.variants, 'variants')
    const perceptualHashExpression = optionalParamExpression(image.perceptual_hash, 'perceptual_hash')
    const uploadedByExpression = optionalParamExpression(input.uploadedBy, 'uploaded_by')
    const createdByExpression = input.createdBy ? 'type::record($userTable, $created_by)' : 'NONE'
    const visibility = input.visibility === 'private' ? 'private' : 'public'
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
        image_meta: ${imageMetaExpression},
        folders: [],
        tags: [],
        reference_count: 0,
        referenced_by: [],
        visibility: $visibility,
        created_by: ${createdByExpression},
        original_path: $original_path,
        variants: ${variantsExpression},
        perceptual_hash: ${perceptualHashExpression},
        uploaded_by: ${uploadedByExpression}
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
        original_path: originalPath,
        variants: image.variants,
        perceptual_hash: image.perceptual_hash,
        uploaded_by: input.uploadedBy ?? null,
        visibility,
        userTable: 'users',
        created_by: input.createdBy ? recordIdPart(input.createdBy, 'users') : null
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
    await mediaDeleteStoredObjects({
      original_path: originalPath || mediaOriginalRelativePath(hash, extension, createdAt),
      variants: image.variants ?? null
    })
    throw error
  }
}

export async function mediaReadFileByHash(db: Surreal, hash: string) {
  const record = await queryDbRecord(db, 'files', recordIdPart(hash, 'files'))
  return record ? mediaNormalizeFileRecord(record) : null
}

export async function mediaFindSimilarImage(db: Surreal, perceptualHash: string, threshold: number) {
  const response = await queryDb(db, `SELECT ${MEDIA_FILE_RECORD_COLUMNS} FROM files WHERE perceptual_hash != NONE;`)

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
  const search = String(options.search || '').trim()
  const fileName = String(options.file_name || '').trim()
  const extension = String(options.extension || '').trim().replace(/^\./, '')
  const comment = String(options.comment || '').trim()
  const tagQueries = normalizeStringArray(options.tags)
  const useRegex = options.search_regex === true
  const caseInsensitive = options.case_insensitive !== false
  const ftsSearchIds = search && !useRegex ? await mediaSearchFtsIds(db, search) : null
  const response = await queryDb(db, `SELECT ${MEDIA_FILE_RECORD_COLUMNS} FROM files;`)
  const allFiles = queryRows<Record<string, unknown>>(response).map(mediaNormalizeFileRecord)
  const fromDate = options.uploaded_from ? normalizeDateBoundary(options.uploaded_from, 'start') : null
  const toDate = options.uploaded_to ? normalizeDateBoundary(options.uploaded_to, 'end') : null
  const normalizedFolderId = options.folder ? `folder:${mediaNormalizeFolderId(options.folder)}` : ''
  const selectedFolder = normalizedFolderId ? await mediaReadFolderById(db, normalizedFolderId) : null
  const selectedDefaultFolderId = selectedFolder?.slug === 'default' ? selectedFolder.id : ''
  const filenameRegex = compileRegex(options.filename_regex, options.filename_regex_case_insensitive !== false)
  const tagRelation = options.tag_relation === 'or' ? 'or' : 'and'

  const filtered = allFiles
    .filter((file) => mediaRecordVisibleToUser(file, options.visibleToUser))
    .filter((file) => !options.visibility || options.visibility === 'all' || file.visibility === options.visibility)
    .filter((file) => !options.type || options.type === 'all' || mediaRecordMatchesType(file, options.type))
    .filter((file) => !options.mime_type || file.mime_type === options.mime_type)
    .filter((file) => !normalizedFolderId || mediaFileMatchesFolder(file, normalizedFolderId, selectedDefaultFolderId))
    .filter((file) => !options.tag || mediaTagsMatch(file.tags || [], [options.tag], { useRegex, caseInsensitive }))
    .filter((file) => !tagQueries.length || mediaTagsMatch(file.tags || [], tagQueries, { useRegex, caseInsensitive, relation: tagRelation }))
    .filter((file) => !fromDate || new Date(file.uploaded_at || file.created_at).getTime() >= fromDate.getTime())
    .filter((file) => !toDate || new Date(file.uploaded_at || file.created_at).getTime() <= toDate.getTime())
    .filter((file) => !options.orphan || ((file.reference_count || 0) === 0 && !(file.referenced_by || []).length))
    .filter((file) => !search || (ftsSearchIds ? ftsSearchIds.has(file.id) : mediaGlobalTextMatches(file, search, { useRegex, caseInsensitive })))
    .filter((file) => !fileName || mediaTextMatches(file.original_name, fileName, { useRegex, caseInsensitive }))
    .filter((file) => !extension || mediaTextMatches(file.extension, extension, { useRegex, caseInsensitive }))
    .filter((file) => !comment || mediaTextMatches(file.comment || '', comment, { useRegex, caseInsensitive }))
    .filter((file) => !filenameRegex || filenameRegex.test(file.original_name))
    .filter((file) => !options.advanced || mediaAdvancedMatches(file, options.advanced))

  const files = [...filtered].sort((a, b) => mediaCompareRecords(a, b, options.sort)).slice(offset, offset + limit)
  const total = filtered.length

  return {
    files,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  }
}

async function mediaSearchFtsIds(db: Surreal, search: string) {
  const response = await queryDb(
    db,
    `SELECT id
     FROM files
     WHERE original_name @0@ $needle OR comment @1@ $needle;`,
    { needle: search }
  )

  return new Set(queryRows<{ id: unknown }>(response).map((record) => stringifyRecordId(record.id)))
}

async function mediaReadFolderById(db: Surreal, folderId: string) {
  const record = await queryDbRecord(db, 'folder', mediaNormalizeFolderId(folderId))
  return record ? mediaNormalizeFolderRecord(record) : null
}

function normalizeDateBoundary(value: string, boundary: 'start' | 'end') {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (boundary === 'start') {
      return new Date(`${value}T00:00:00.000Z`)
    }
    return new Date(`${value}T23:59:59.999Z`)
  }

  return new Date(value)
}

function compileRegex(pattern: string | undefined, caseInsensitive: boolean) {
  const trimmed = String(pattern || '').trim()
  if (!trimmed) return null

  try {
    return new RegExp(trimmed, caseInsensitive ? 'i' : '')
  } catch {
    return null
  }
}

function mediaTextMatches(value: string, query: string, options: { useRegex: boolean, caseInsensitive: boolean }) {
  if (!query) return true

  if (options.useRegex) {
    const regex = compileRegex(query, options.caseInsensitive)
    return regex ? regex.test(value) : false
  }

  if (options.caseInsensitive) {
    return value.toLowerCase().includes(query.toLowerCase())
  }

  return value.includes(query)
}

function mediaGlobalTextMatches(file: MediaRecord, query: string, options: { useRegex: boolean, caseInsensitive: boolean }) {
  return mediaTextMatches(file.original_name, query, options)
    || mediaTextMatches(file.comment || '', query, options)
}

function mediaTagsMatch(tags: string[], queries: string[], options: { useRegex: boolean, caseInsensitive: boolean, relation?: 'and' | 'or' }) {
  const relation = options.relation === 'or' ? 'or' : 'and'
  const matcher = relation === 'or' ? 'some' : 'every'

  return queries[matcher]((query) => tags.some((tag) => {
    if (options.useRegex) {
      return mediaTextMatches(tag, query, options)
    }

    return options.caseInsensitive ? tag.toLowerCase() === query.toLowerCase() : tag === query
  }))
}

function mediaFileMatchesFolder(file: MediaRecord, folderId: string, defaultFolderId: string) {
  const folderIds = file.folders || []
  if (folderIds.includes(folderId)) {
    return true
  }

  if (defaultFolderId && folderId === defaultFolderId) {
    return folderIds.length === 0
  }

  return false
}

function mediaRecordMatchesType(file: MediaRecord, type: string) {
  switch (type) {
    case 'image':
      return file.is_image === true
    case 'video':
      return file.mime_type.startsWith('video/')
    case 'document':
      return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(file.extension.toLowerCase())
    case 'archive':
      return ['zip', 'rar', '7z', 'tar', 'gz'].includes(file.extension.toLowerCase())
    case 'other':
      return !file.is_image
        && !file.mime_type.startsWith('video/')
        && !['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'zip', 'rar', '7z', 'tar', 'gz'].includes(file.extension.toLowerCase())
    default:
      return true
  }
}

function mediaCompareRecords(a: MediaRecord, b: MediaRecord, sort: string | undefined) {
  switch (sort) {
    case 'uploaded_at_asc':
      return new Date(a.uploaded_at || a.created_at).getTime() - new Date(b.uploaded_at || b.created_at).getTime()
    case 'name_asc':
      return a.original_name.localeCompare(b.original_name)
    case 'name_desc':
      return b.original_name.localeCompare(a.original_name)
    case 'size_asc':
      return a.size - b.size
    case 'size_desc':
      return b.size - a.size
    default:
      return new Date(b.uploaded_at || b.created_at).getTime() - new Date(a.uploaded_at || a.created_at).getTime()
  }
}

function mediaAdvancedMatches(file: MediaRecord, group: MediaAdvancedGroup): boolean {
  const conditions = Array.isArray(group.conditions) ? group.conditions : []
  if (!conditions.length) return true

  const op = group.op === 'OR' ? 'OR' : 'AND'
  const results: boolean[] = conditions.map((condition): boolean => {
    if ('conditions' in condition) {
      return mediaAdvancedMatches(file, condition as MediaAdvancedGroup)
    }

    return mediaAdvancedConditionMatches(file, condition as MediaAdvancedCondition)
  })

  return op === 'OR' ? results.some(Boolean) : results.every(Boolean)
}

function mediaAdvancedConditionMatches(file: MediaRecord, condition: MediaAdvancedCondition) {
  const field = condition.field || 'name'
  const operator = condition.operator || 'contains'
  const value = String(condition.value || '')
  const valueTo = String(condition.valueTo || '')
  const caseInsensitive = condition.caseInsensitive !== false

  if (field === 'uploaded_at') {
    const uploadedTime = new Date(file.uploaded_at || file.created_at).getTime()
    if (operator === 'before') return uploadedTime <= normalizeDateBoundary(value, 'end').getTime()
    if (operator === 'after') return uploadedTime >= normalizeDateBoundary(value, 'start').getTime()
    if (operator === 'between') {
      return uploadedTime >= normalizeDateBoundary(value, 'start').getTime()
        && uploadedTime <= normalizeDateBoundary(valueTo || value, 'end').getTime()
    }
  }

  if (field === 'orphan') {
    return ((file.reference_count || 0) === 0 && !(file.referenced_by || []).length) === (value !== 'false')
  }

  if (field === 'type') {
    return mediaRecordMatchesType(file, value)
  }

  const target = mediaAdvancedFieldText(file, field)
  if (operator === 'equals') {
    return caseInsensitive ? target.toLowerCase() === value.toLowerCase() : target === value
  }
  if (operator === 'regex') {
    const regex = compileRegex(value, caseInsensitive)
    return regex ? regex.test(target) : false
  }

  return mediaTextMatches(target, value, { useRegex: false, caseInsensitive })
}

function mediaAdvancedFieldText(file: MediaRecord, field: string) {
  switch (field) {
    case 'original_name':
    case 'name':
    case 'file_name':
      return file.original_name
    case 'extension':
    case 'file_extension':
      return file.extension
    case 'comment':
    case 'comments':
      return file.comment || ''
    case 'tag':
    case 'tags':
      return (file.tags || []).join(' ')
    case 'mime_type':
      return file.mime_type
    default:
      return file.original_name
  }
}

function optionalParamExpression(value: unknown, name: string) {
  return value === null || value === undefined || value === '' ? 'NONE' : `$${name}`
}

export async function mediaUniqueFolderSlug(db: Surreal, desired: string, currentRecordId?: string) {
  const base = slugify(desired)

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
    const existing = await findBySlug(db, 'folder', candidate)

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

function normalizeVariants(value: unknown, hash: string) {
  const input = normalizeObject(value)
  if (!input) {
    return undefined
  }

  const sizes: MediaVariantSize[] = ['thumbnail', 'medium', 'large']
  const output: Partial<Record<MediaVariantSize, MediaVariantRecord>> = {}

  for (const size of sizes) {
    const raw = normalizeObject(input[size])
    if (!raw) {
      continue
    }
    const path = raw ? stringOrNull(raw.path) : null
    if (!path) {
      continue
    }

    output[size] = {
      path,
      url: `/api/media/variant/${size}/${encodeURIComponent(hash)}`,
      mime_type: stringOrNull(raw.mime_type) ?? 'image/webp',
      width: numberOrNull(raw.width),
      height: numberOrNull(raw.height),
      size: numberOrNull(raw.size)
    }
  }

  return Object.keys(output).length ? output : undefined
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}
