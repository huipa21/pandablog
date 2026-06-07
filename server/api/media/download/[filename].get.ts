import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { requireContentManager } from '../../../utils/auth'

const downloadsRoot = resolve(process.cwd(), 'storage/downloads')

export default defineEventHandler(async (event) => {
  await requireContentManager(event)
  const filename = getRouterParam(event, 'filename') ?? ''

  // Validate filename to prevent path traversal
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw createError({ statusCode: 400, message: 'Invalid filename' })
  }

  const filePath = resolve(downloadsRoot, filename)

  // Ensure resolved path is inside downloads root
  if (!filePath.startsWith(downloadsRoot)) {
    throw createError({ statusCode: 400, message: 'Invalid filename' })
  }

  try {
    await access(filePath)
  } catch {
    throw createError({ statusCode: 404, message: 'Download file not found' })
  }

  const fileStat = await stat(filePath)

  setResponseHeaders(event, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${basename(filename)}"`,
    'Content-Length': String(fileStat.size),
    'Cache-Control': 'no-cache'
  })

  return sendStream(event, createReadStream(filePath))
})
