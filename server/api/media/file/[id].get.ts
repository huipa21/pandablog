import { queryDb, useDb } from '../../../utils/db'
import { mediaCreateUploadStream, mediaStatUpload } from '../../../utils/fileStorage'
import { mediaNormalizeFileRecord, mediaNormalizeHash } from '../../../utils/mediaLibrary'
import { firstRow } from '../../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  const id = mediaNormalizeHash(getRouterParam(event, 'id') ?? '')
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: 'files',
    id
  })
  const record = firstRow<Record<string, unknown>>(response)

  if (!record) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  const file = mediaNormalizeFileRecord(record)

  try {
    const stats = await mediaStatUpload(file.storage_path || '')
    const isDownload = getQuery(event).download === 'true'
    setResponseHeader(event, 'Content-Type', file.mime_type || 'application/octet-stream')
    setResponseHeader(event, 'Content-Length', stats.size)
    setResponseHeader(event, 'Cache-Control', isDownload ? 'no-cache' : 'public, max-age=31536000, immutable')
    setResponseHeader(event, 'Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${encodeHeaderValue(file.original_name)}"`)
    return sendStream(event, mediaCreateUploadStream(file.storage_path || ''))
  } catch {
    throw createError({ statusCode: 404, message: 'File not found on disk' })
  }
})

function encodeHeaderValue(value: string) {
  return value.replace(/["\\\r\n]/g, '_')
}
