import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { queryDb, useDb } from '../../utils/db'
import { requireAdminUser } from '../../utils/auth'
import { firstRow } from '../../utils/surrealResult'

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf'
])

const maxFileSize = 10 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const user = await requireAdminUser(event)
  const formData = await readMultipartFormData(event)
  const file = formData?.find((item) => item.filename && item.data)

  if (!file) {
    throw createError({ statusCode: 400, message: 'File is required' })
  }

  if (!file.type || !allowedMimeTypes.has(file.type)) {
    throw createError({ statusCode: 415, message: 'Unsupported file type' })
  }

  if (file.data.length > maxFileSize) {
    throw createError({ statusCode: 413, message: 'File is too large' })
  }

  const hash = createHash('sha256').update(file.data).digest('hex')
  const db = await useDb()
  const existingResponse = await queryDb(db, 'SELECT * FROM asset WHERE hash = $hash LIMIT 1;', { hash })
  const existing = firstRow<Record<string, unknown>>(existingResponse)

  if (existing) {
    return existing
  }

  const now = new Date()
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const extension = safeExtension(file.filename ?? '')
  const filename = `${hash}${extension}`
  const relativeDir = join('uploads', year, month)
  const publicDir = join(process.cwd(), 'public', relativeDir)
  const diskPath = join(publicDir, filename)
  const publicUrl = `/${relativeDir.replace(/\\/g, '/')}/${filename}`

  await mkdir(publicDir, { recursive: true })
  await writeFile(diskPath, file.data)

  const createResponse = await queryDb(db, 'CREATE asset CONTENT $asset;', {
    asset: {
      filename: file.filename ?? filename,
      path: diskPath,
      url: publicUrl,
      mime: file.type,
      size_bytes: file.data.length,
      hash,
      uploaded_by: user.username
    }
  })

  return firstRow<Record<string, unknown>>(createResponse)
})

function safeExtension(filename: string) {
  const extension = extname(filename).toLowerCase()
  return /^[a-z0-9.]+$/.test(extension) ? extension : ''
}