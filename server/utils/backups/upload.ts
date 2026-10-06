import { createWriteStream } from 'node:fs'
import { type IncomingMessage } from 'node:http'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { join } from 'node:path'
import { createError } from 'h3'
import Busboy from 'busboy'
import { BACKUP_LIMITS, byteLimit, checkDisk } from './streams'
import type { ExternalBackupFiles } from './importExternal'

/** Every part/write is settled before this promise rejects. Caller can then
 * remove the stage without writers recreating/truncating it afterwards. */
export async function receiveBackupUpload(request: IncomingMessage, directory: string, deadlineMs: number = BACKUP_LIMITS.deadlineMs): Promise<ExternalBackupFiles> {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > BACKUP_LIMITS.deadlineMs) throw new Error('Invalid backup upload deadline')
  const files: ExternalBackupFiles = {dbGzPath: join(directory, 'db.surql.gz'), mediaTarGzPath: join(directory, 'media.tar.gz')}
  const seen = new Set<string>(), active = new Set<Readable>(), writes: Promise<void>[] = []
  const parser = Busboy({headers: request.headers, limits: {files: 3, fields: 0, parts: 4, fileSize: BACKUP_LIMITS.mediaBytes, headerPairs: 32}})
  let failure: Error | undefined
  const fail = (error: Error) => {
    if (failure) return
    failure = error
    request.unpipe(parser); request.pause()
    for (const stream of active) stream.destroy(error)
    parser.destroy(error)
  }
  const invalid = () => fail(createError({statusCode: 400, message: 'Duplicate, unknown or excess backup multipart part'}))
  const abort = () => fail(createError({statusCode: 400, message: 'Backup upload aborted'}))
  const timer = setTimeout(() => fail(createError({statusCode: 408, message: 'Backup upload deadline exceeded'})), deadlineMs)
  request.once('aborted', abort); request.once('error', abort)
  const done = new Promise<void>((resolve) => {parser.once('close', resolve); parser.once('error', error => {failure ??= error instanceof Error ? error : new Error('Backup parser failed')})})
  parser.on('file', (name, stream) => {
    stream.on('error', () => {})
    if (!['db', 'media', 'manifest'].includes(name) || seen.has(name)) {stream.resume(); invalid(); return}
    seen.add(name); active.add(stream)
    stream.once('limit', () => fail(createError({statusCode: 413, message: 'Backup file exceeds byte limit'})))
    const cap = name === 'db' ? BACKUP_LIMITS.compressedBytes : name === 'manifest' ? BACKUP_LIMITS.manifestBytes : BACKUP_LIMITS.mediaBytes
    let checking = 0
    const meter = new Transform({transform(chunk: Buffer, _encoding, callback) {
      checking += chunk.length
      if (checking < 1024 * 1024) callback(null, chunk)
      else {checking = 0; void checkDisk(directory).then(() => callback(null, chunk), callback)}
    }})
    const task = name === 'manifest' ? (async () => {
      const chunks: Buffer[] = [], limited = byteLimit(cap)
      const pumping = pipeline(stream, limited)
      void pumping.catch(() => {})
      try {for await (const chunk of limited) chunks.push(Buffer.from(chunk)); await pumping; files.manifestBuffer = Buffer.concat(chunks)} finally {limited.destroy(); await pumping.catch(() => {})}
    })() : pipeline(stream, byteLimit(cap), meter, createWriteStream(name === 'db' ? files.dbGzPath : files.mediaTarGzPath, {flags: 'wx', mode: 0o600}))
    writes.push(task.catch(error => {fail(createError({statusCode: 413, message: error instanceof Error ? error.message : 'Backup upload failed'}))}).finally(() => {active.delete(stream)}))
  })
  for (const name of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) parser.once(name, invalid)
  parser.on('field', invalid)
  try {
    await checkDisk(directory)
    if (request.aborted) abort()
    else request.pipe(parser)
    await done
    await Promise.allSettled(writes)
    if (failure) throw failure
    if (!seen.has('db') || !seen.has('media')) throw createError({statusCode: 400, message: 'Both db and media backup files are required'})
    return files
  } finally {
    clearTimeout(timer); request.off('aborted', abort); request.off('error', abort)
    request.unpipe(parser)
    if (!parser.destroyed) parser.destroy()
    for (const stream of active) stream.destroy()
    await Promise.allSettled(writes)
  }
}
