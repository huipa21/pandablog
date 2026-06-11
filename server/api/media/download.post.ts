import { mkdir } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { requireContentManager } from '../../utils/auth'
import { queryDb, useDb } from '../../utils/db'
import { mediaResolveOriginalPath } from '../../utils/fileStorage'
import { mediaNormalizeHash, mediaNormalizeFileRecord } from '../../utils/mediaLibrary'
import { queryRows } from '../../utils/surrealResult'

const require = createRequire(import.meta.url)
const archiver: typeof import('archiver') = require('archiver')

const downloadsRoot = resolve(process.cwd(), 'storage/downloads')

export default defineEventHandler(async (event) => {
  await requireContentManager(event)
  const body = await readBody<{ hashes: string[] }>(event)

  if (!Array.isArray(body.hashes) || !body.hashes.length) {
    throw createError({ statusCode: 400, message: 'hashes[] is required' })
  }

  if (body.hashes.length > 200) {
    throw createError({ statusCode: 400, message: 'Maximum 200 files per download' })
  }

  const db = await useDb()
  const hashes = body.hashes.map((h) => mediaNormalizeHash(h)).filter(Boolean)

  // Single file: redirect to the file stream endpoint
  if (hashes.length === 1) {
    const hash = hashes[0]
    return { type: 'single', url: `/api/media/file/${hash}?download=true` }
  }

  // Multiple files: create a zip
  await mkdir(downloadsRoot, { recursive: true })

  const zipName = `media-${Date.now()}.zip`
  const zipPath = resolve(downloadsRoot, zipName)

  const archive = archiver('zip', { zlib: { level: 5 } })
  const output = createWriteStream(zipPath)
  const fileResponse = await queryDb(
    db,
    `SELECT id, hash, original_name, original_path
     FROM files
     WHERE hash IN $hashes;`,
    { hashes }
  )
  const filesByHash = new Map(queryRows<Record<string, unknown>>(fileResponse).map((record) => {
    const file = mediaNormalizeFileRecord(record)
    return [file.hash, file]
  }))

  await new Promise<void>((resolvePromise, reject) => {
    output.on('close', resolvePromise)
    archive.on('error', reject)
    archive.pipe(output)

    const appendFiles = async () => {
      for (const hash of hashes) {
        try {
          const file = filesByHash.get(hash)
          if (!file?.original_path) continue
          const absolutePath = mediaResolveOriginalPath(file.original_path)
          archive.file(absolutePath, { name: file.original_name })
        } catch {
          // Skip files that can't be read
        }
      }
      await archive.finalize()
    }

    appendFiles().catch(reject)
  })

  return { type: 'zip', url: `/api/media/download/${zipName}` }
})
