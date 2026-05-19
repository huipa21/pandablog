import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { Surreal } from 'surrealdb'
import { queryDb, useDb } from '../../utils/db'
import { getMediaSettings, type MediaSettings } from '../../utils/settings'
import { saveFile, saveThumbnail, deleteStorageFile, deleteThumbnail } from '../../utils/storage'
import { validateUpload, getExtension } from '../../utils/validateUpload'
import { computePHash, isSimilar } from '../../utils/imageHash'
import { requireAdminUser } from '../../utils/auth'
import type { MediaRecord, UploadFileResult } from '~/types/content'

/**
 * Allowed image formats for dimension checking and thumbnail generation
 */
const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp']

interface MultipartFile {
  filename: string
  data: Buffer
  type: string
}

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const settings = await getMediaSettings()
  const db = await useDb()

  // Read multipart form data
  const form = await readMultipartFormData(event)
  if (!form || form.length === 0) {
    throw createError({ statusCode: 400, message: 'No files provided' })
  }

  const files: MultipartFile[] = []
  for (const field of form) {
    if (field.type === 'file' && field.data) {
      files.push({
        filename: field.filename || 'unknown',
        data: field.data,
        type: field.type
      })
    }
  }

  if (files.length === 0) {
    throw createError({ statusCode: 400, message: 'No files provided' })
  }

  if (files.length > settings.max_files_per_upload) {
    throw createError({
      statusCode: 400,
      message: `Maximum ${settings.max_files_per_upload} files per upload allowed`
    })
  }

  const results: UploadFileResult[] = []

  // Process files sequentially to limit memory use
  for (const file of files) {
    try {
      const result = await processFile(file, settings, db)
      results.push(result)
    } catch (error) {
      results.push({
        original_name: file.filename,
        status: 'rejected',
        reason: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  return { results }
})

async function processFile(
  file: MultipartFile,
  settings: MediaSettings,
  db: Surreal
): Promise<UploadFileResult> {
  const extension = getExtension(file.filename)

  // Step 1: Validate extension and size
  const validation = validateUpload(file.filename, file.data.length, 'application/octet-stream', settings)
  if (!validation.valid) {
    return {
      original_name: file.filename,
      status: 'rejected',
      reason: validation.reason
    }
  }

  // Step 2: Compute SHA-256 hash
  const hash = createHash('sha256').update(file.data).digest('hex')

  // Step 3: Check for existing file
  const existing = await queryDb<[Record<string, unknown>[]]>(
    db,
    'SELECT * FROM type::record($table, $id) LIMIT 1;',
    { table: 'media', id: hash }
  )

  if (existing[0]?.[0]) {
    const record = normalizeMediaRecord(existing[0][0])
    return {
      original_name: file.filename,
      extension,
      status: 'duplicate',
      record
    }
  }

  // Step 4: Generate MIME type from extension
  const mimeType = getMimeTypeForExtension(extension)

  // Step 5: Save to storage
  const path = await saveFile(hash, file.data, extension)
  const url = `/api/media/file/${hash}`

  // Step 6: Process images (dimensions, thumbnail, perceptual hash)
  let width: number | null = null
  let height: number | null = null
  let thumbnailPath: string | null = null
  let perceptualHash: string | null = null

  if (IMAGE_FORMATS.includes(extension.toLowerCase())) {
    try {
      // Get image dimensions
      const metadata = await sharp(file.data).metadata()
      width = metadata.width ?? null
      height = metadata.height ?? null

      // Generate thumbnail (300px, webp)
      try {
        const thumbnailBuffer = await sharp(file.data)
          .resize(300, 300, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .webp({ quality: 80 })
          .toBuffer()

        thumbnailPath = await saveThumbnail(hash, thumbnailBuffer)
      } catch {
        // Thumbnail generation failed, continue without it
      }

      // Compute perceptual hash
      if (settings.enable_perceptual_dedup) {
        try {
          perceptualHash = await computePHash(file.data)

          // Check for similar images
          if (perceptualHash) {
            const similar = await findSimilarImage(db, perceptualHash, settings.perceptual_dedup_threshold)
            if (similar) {
              // Delete saved files since we're returning similar status
              await deleteStorageFile(path)
              if (thumbnailPath) {
                await deleteThumbnail(thumbnailPath)
              }

              return {
                original_name: file.filename,
                extension,
                status: 'similar',
                similar_to: similar
              }
            }
          }
        } catch {
          // Perceptual hashing failed, continue without it
        }
      }
    } catch {
      // Image processing failed, but file was saved - just continue
    }
  }

  // Step 7: Create DB record
  const mediaRecord: MediaRecord = {
    id: `media:${hash}`,
    original_name: file.filename,
    extension,
    mime_type: mimeType,
    size: file.data.length,
    hash,
    path,
    url,
    width,
    height,
    thumbnail_path: thumbnailPath,
    perceptual_hash: perceptualHash,
    created_at: new Date().toISOString()
  }

  const createResponse = await queryDb<[Record<string, unknown>[]]>(
    db,
    `CREATE type::record($table, $id) CONTENT {
      original_name: $original_name,
      extension: $extension,
      mime_type: $mime_type,
      size: $size,
      hash: $hash,
      path: $path,
      url: $url,
      width: $width,
      height: $height,
      thumbnail_path: $thumbnail_path,
      perceptual_hash: $perceptual_hash
    };`,
    {
      table: 'media',
      id: hash,
      original_name: file.filename,
      extension,
      mime_type: mimeType,
      size: file.data.length,
      hash,
      path,
      url,
      width,
      height,
      thumbnail_path: thumbnailPath,
      perceptual_hash: perceptualHash
    }
  )

  const created = normalizeMediaRecord(createResponse[0]?.[0])

  return {
    original_name: file.filename,
    extension,
    status: 'created',
    record: created
  }
}

async function findSimilarImage(db: Surreal, hash: string, threshold: number): Promise<MediaRecord | null> {
  const response = await queryDb<[Record<string, unknown>[]]>(
    db,
    'SELECT * FROM media WHERE perceptual_hash != NONE;'
  )

  for (const record of response[0] ?? []) {
    const existing = normalizeMediaRecord(record)
    if (existing.perceptual_hash && isSimilar(hash, existing.perceptual_hash, threshold)) {
      return existing
    }
  }

  return null
}

function getMimeTypeForExtension(ext: string): string {
  const mimeMap: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'zip': 'application/zip'
  }
  return mimeMap[ext.toLowerCase()] || 'application/octet-stream'
}

function normalizeMediaRecord(record: any): MediaRecord {
  return {
    id: record.id || '',
    original_name: String(record.original_name ?? ''),
    extension: String(record.extension ?? ''),
    mime_type: String(record.mime_type ?? ''),
    size: Number(record.size ?? 0),
    hash: String(record.hash ?? ''),
    path: String(record.path ?? ''),
    url: String(record.url ?? ''),
    width: record.width ?? null,
    height: record.height ?? null,
    thumbnail_path: record.thumbnail_path ?? null,
    perceptual_hash: record.perceptual_hash ?? null,
    created_at: String(record.created_at ?? '')
  }
}
