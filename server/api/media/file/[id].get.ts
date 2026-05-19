import { readStorageFile } from '../../../utils/storage'
import { recordIdPart } from '../../../utils/surrealResult'
import { queryDb, useDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'media')
  const db = await useDb()

  // Fetch the media record to get path and MIME type
  const response = await queryDb(
    db,
    'SELECT path, mime_type FROM type::record($table, $id) LIMIT 1;',
    { table: 'media', id }
  )

  const record = (response[0] as any)?.[0]
  if (!record || !record.path) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  try {
    const buffer = await readStorageFile(record.path)

    // Set response headers
    setResponseHeader(event, 'Content-Type', String(record.mime_type || 'application/octet-stream'))
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    setResponseHeader(event, 'Content-Length', buffer.length)

    return buffer
  } catch (error) {
    throw createError({ statusCode: 404, message: 'File not found on disk' })
  }
})
