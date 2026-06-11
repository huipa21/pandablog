import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import type { Readable } from 'node:stream'
import Busboy from 'busboy'
import { requireSuperadmin } from '../../../utils/auth'
import { importExternalBackup } from '../../../utils/backups/importExternal'

const MAX_DB_SIZE = 512 * 1024 * 1024 // 512 MB
const MAX_MEDIA_SIZE = 4 * 1024 * 1024 * 1024 // 4 GB
const MAX_MANIFEST_SIZE = 1 * 1024 * 1024 // 1 MB

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)

  const headers = event.node.req.headers
  const contentType = headers['content-type'] ?? ''
  if (!contentType.includes('multipart/form-data')) {
    throw createError({ statusCode: 400, message: 'Expected multipart/form-data' })
  }

  // Stream the uploaded parts straight to a temp directory so we never buffer
  // the (potentially multi-GB) archives in memory.
  const stagingDir = await mkdtemp(path.join(tmpdir(), 'pandablog-import-'))
  const dbPath = path.join(stagingDir, 'db.surql.gz')
  const mediaPath = path.join(stagingDir, 'media.tar.gz')

  let haveDb = false
  let haveMedia = false
  const manifestChunks: Buffer[] = []
  let manifestBytes = 0

  try {
    await new Promise<void>((resolve, reject) => {
      const bb = Busboy({
        headers: headers as Record<string, string>,
        limits: { files: 3, fileSize: MAX_MEDIA_SIZE },
      })
      const pending: Promise<void>[] = []
      let settled = false

      const fail = (err: unknown) => {
        if (settled) return
        settled = true
        reject(err)
      }

      bb.on('file', (name, stream: Readable, _info) => {
        if (name === 'db') {
          haveDb = true
          pending.push(saveCapped(stream, dbPath, MAX_DB_SIZE, 'db.surql.gz').catch(fail))
        } else if (name === 'media') {
          haveMedia = true
          pending.push(saveCapped(stream, mediaPath, MAX_MEDIA_SIZE, 'media.tar.gz').catch(fail))
        } else if (name === 'manifest') {
          stream.on('data', (chunk: Buffer) => {
            manifestBytes += chunk.length
            if (manifestBytes <= MAX_MANIFEST_SIZE) manifestChunks.push(chunk)
          })
          stream.on('error', fail)
        } else {
          stream.resume() // discard unknown fields
        }
      })

      bb.on('error', fail)
      bb.on('close', () => {
        if (settled) return
        Promise.all(pending)
          .then(() => {
            settled = true
            resolve()
          })
          .catch(fail)
      })

      event.node.req.pipe(bb)
    })

    if (!haveDb) {
      throw createError({ statusCode: 400, message: 'Missing db file (field name: db)' })
    }
    if (!haveMedia) {
      throw createError({ statusCode: 400, message: 'Missing media file (field name: media)' })
    }

    const id = await importExternalBackup({
      dbGzPath: dbPath,
      mediaTarGzPath: mediaPath,
      manifestBuffer: manifestChunks.length ? Buffer.concat(manifestChunks) : null,
    })

    setResponseStatus(event, 201)
    return { ok: true, id }
  } finally {
    // importExternalBackup moves the staged files into the backup dir on
    // success; clean up anything left behind (failures / leftovers).
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
  }
})

/**
 * Streams a busboy file part to `dest`, aborting with HTTP 413 if it exceeds
 * `cap` bytes. Resolves once the file is fully written.
 */
function saveCapped(stream: Readable, dest: string, cap: number, label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let bytes = 0
    let settled = false
    const ws = createWriteStream(dest)

    const done = (err?: unknown) => {
      if (settled) return
      settled = true
      if (err) {
        ws.destroy()
        reject(err)
      } else {
        resolve()
      }
    }

    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > cap) {
        stream.unpipe(ws)
        stream.resume() // drain the remainder so busboy can finish
        done(createError({ statusCode: 413, message: `${label} exceeds the allowed size limit` }))
      }
    })
    // busboy fileSize limit backstop
    stream.on('limit', () => done(createError({ statusCode: 413, message: `${label} exceeds the allowed size limit` })))
    stream.on('error', done)
    ws.on('error', done)
    ws.on('finish', () => done())

    stream.pipe(ws)
  })
}
