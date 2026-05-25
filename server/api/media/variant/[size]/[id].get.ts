import { queryDb, useDb } from '../../../../utils/db'
import { mediaCreateVariantStream, mediaStatVariant } from '../../../../utils/fileStorage'
import { assertLocalMediaRequest } from '../../../../utils/mediaAccess'
import { mediaNormalizeFileRecord, mediaNormalizeHash } from '../../../../utils/mediaLibrary'
import { firstRow } from '../../../../utils/surrealResult'
import type { MediaVariantSize } from '~/types/content'

const allowedSizes = new Set<MediaVariantSize>(['thumbnail', 'medium', 'large'])

export default defineEventHandler(async (event) => {
  assertLocalMediaRequest(event)

  const id = mediaNormalizeHash(getRouterParam(event, 'id') ?? '')
  const sizeParam = String(getRouterParam(event, 'size') ?? '').trim().toLowerCase() as MediaVariantSize

  if (!allowedSizes.has(sizeParam)) {
    throw createError({ statusCode: 400, message: 'Invalid variant size' })
  }

  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: 'files',
    id
  })
  const record = firstRow<Record<string, unknown>>(response)

  if (!record) {
    throw createError({ statusCode: 404, message: 'Variant not found' })
  }

  const file = mediaNormalizeFileRecord(record)
  const variant = file.variants?.[sizeParam]
  if (!variant?.path) {
    throw createError({ statusCode: 404, message: 'Variant not found' })
  }

  try {
    const stats = await mediaStatVariant(variant.path)
    setResponseHeader(event, 'Content-Type', variant.mime_type || 'image/webp')
    setResponseHeader(event, 'Content-Length', stats.size)
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    return sendStream(event, mediaCreateVariantStream(variant.path))
  } catch {
    throw createError({ statusCode: 404, message: 'Variant not found on disk' })
  }
})
