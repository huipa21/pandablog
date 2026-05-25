import { queryDb, useDb } from '../../../utils/db'
import { mediaCreateThumbnailStream, mediaStatThumbnail } from '../../../utils/fileStorage'
import { assertLocalMediaRequest } from '../../../utils/mediaAccess'
import { mediaNormalizeFileRecord, mediaNormalizeHash } from '../../../utils/mediaLibrary'
import { firstRow } from '../../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  assertLocalMediaRequest(event)

  const id = mediaNormalizeHash(getRouterParam(event, 'id') ?? '')
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: 'files',
    id
  })
  const record = firstRow<Record<string, unknown>>(response)

  if (!record) {
    throw createError({ statusCode: 404, message: 'Thumbnail not found' })
  }

  const file = mediaNormalizeFileRecord(record)

  if (!file.thumbnail_path) {
    throw createError({ statusCode: 404, message: 'Thumbnail not found' })
  }

  try {
    const stats = await mediaStatThumbnail(file.thumbnail_path)
    setResponseHeader(event, 'Content-Type', 'image/webp')
    setResponseHeader(event, 'Content-Length', stats.size)
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    return sendStream(event, mediaCreateThumbnailStream(file.thumbnail_path))
  } catch {
    throw createError({ statusCode: 404, message: 'Thumbnail not found on disk' })
  }
})
