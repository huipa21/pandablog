import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { lstat, mkdtemp, mkdir, opendir, readFile, rm, statfs, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { basename, join, resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import Busboy from 'busboy'
import { createError } from 'h3'

export const MEDIA_UPLOAD_LIMITS = {fileBytes: 32 * 1024 * 1024, requestBytes: 128 * 1024 * 1024, files: 20, deadlineMs: 60_000, reserveBytes: 512 * 1024 * 1024}
export interface StagedMediaFile {path: string, hash: string, size: number, originalName: string, mimeType: string}
/** Atomic single-process request/disk admission, held through processing/disposal. */
export class MediaUploadBudget {
  private active = 0
  private bytes = 0
  private closed = false
  constructor(private readonly requests = 5, private readonly maxBytes = 512 * 1024 * 1024) {
    if (!Number.isSafeInteger(requests) || requests < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid media staging budget')
  }
  diagnostics() { return {active: this.active, bytes: this.bytes, closed: this.closed} }
  shutdown() { this.closed = true }
  acquire() {
    if (this.closed || this.active >= this.requests) throw createError({statusCode: 503, message: 'Media staging capacity exceeded'})
    this.active++
    let bytes = 0, released = false
    return {
      add: (count: number) => {
        if (released || !Number.isSafeInteger(count) || count < 0 || this.bytes + count > this.maxBytes) throw createError({statusCode: 413, message: 'Media staging byte budget exceeded'})
        bytes += count; this.bytes += count
      },
      release: () => { if (!released) {released = true; this.active--; this.bytes -= bytes} }
    }
  }
}
export const mediaUploadBudget = new MediaUploadBudget()
const stageReceipt = '.media-stage-owner.json'
async function markOwnedStage(directory: string) {
  await writeFile(join(directory, stageReceipt), JSON.stringify({kind: 'pandablog-media-stage-v1', directory: basename(directory)}), {flag: 'wx', mode: 0o600})
}
/** Called only before admission under the app's exclusive writer receipt.
 * Unknown/symlink/partially marked stages refuse startup, not broad rm. */
export async function mediaRecoverStageDirectories(root = resolve('storage/media-stage')) {
  await mkdir(root, {recursive: true})
  let count = 0
  const directories = await opendir(root)
  for await (const entry of directories) {
    if (++count > 100) throw new Error('Media stage recovery budget exceeded; offline inspection required')
    const directory = join(root, entry.name)
    if (!/^upload-[A-Za-z0-9]{6}$/.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Unrecognized media staging object; offline inspection required')
    const receiptPath = join(directory, stageReceipt), info = await lstat(receiptPath)
    if (!info.isFile() || info.size > 1024) throw new Error('Invalid media stage receipt')
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
    if (receipt.kind !== 'pandablog-media-stage-v1' || receipt.directory !== entry.name) throw new Error('Media stage ownership mismatch')
    let files = 0
    const contents = await opendir(directory)
    for await (const file of contents) {
      if (++files > 24 || !file.isFile() || file.isSymbolicLink() || !/^(?:file-\d{1,2}|thumbnail\.webp|medium\.webp|large\.webp|\.media-stage-owner\.json)$/.test(file.name)) throw new Error('Unknown media stage contents; offline inspection required')
    }
    await rm(directory, {recursive: true, force: true, maxRetries: 5, retryDelay: 50})
  }
}
export async function stageMediaBuffer(data: Buffer, originalName: string, mimeType: string) {
  if (data.length > 10 * 1024 * 1024) throw createError({statusCode: 413, message: 'Imported image exceeds byte limit'})
  const lease = mediaUploadBudget.acquire()
  let directory: string | undefined
  try {
    lease.add(data.length)
    const root = resolve('storage/media-stage')
    await mkdir(root, {recursive: true})
    const disk = await statfs(root)
    if (disk.bavail * disk.bsize < MEDIA_UPLOAD_LIMITS.reserveBytes + data.length) throw new Error('Insufficient staging disk')
    directory = await mkdtemp(join(root, 'upload-'))
    await markOwnedStage(directory)
    const path = join(directory, 'file-0')
    await writeFile(path, data, {flag: 'wx', mode: 0o600})
    const file: StagedMediaFile = {path, hash: createHash('sha256').update(data).digest('hex'), size: data.length, originalName, mimeType}
    return {file, dispose: async () => {await rm(directory!, {recursive: true, force: true}); lease.release()}}
  } catch (error) {
    if (directory) await rm(directory, {recursive: true, force: true})
    lease.release(); throw error
  }
}
interface UploadOptions {
  fileBytes?: number, requestBytes?: number, files?: number, deadlineMs?: number, reserveBytes?: number,
  root?: string, budget?: MediaUploadBudget, signal?: AbortSignal
}
export async function receiveMediaUpload(request: IncomingMessage, options: UploadOptions = {}) {
  const limits = {...MEDIA_UPLOAD_LIMITS, ...options}
  for (const key of ['fileBytes', 'requestBytes', 'files', 'deadlineMs'] as const) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > MEDIA_UPLOAD_LIMITS[key]) throw new Error('Invalid media upload limits')
  }
  if (!Number.isSafeInteger(limits.reserveBytes) || limits.reserveBytes < 0) throw new Error('Invalid disk reserve')
  const lease = (options.budget ?? mediaUploadBudget).acquire()
  let directory: string | undefined
  const files: StagedMediaFile[] = [], writes: Promise<void>[] = [], active = new Set<Readable>()
  let failure: Error | undefined, parser: ReturnType<typeof Busboy> | undefined, meter: Transform | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const fail = (error: Error) => {
    if (failure) return
    failure = error
    request.unpipe(); request.pause()
    // Busboy emits limit during its synchronous write; defer destruction to
    // avoid corrupting its internal file-stream state on oversized parts.
    queueMicrotask(() => {
      for (const stream of active) stream.destroy(error)
      meter?.destroy(error); parser?.destroy(error)
    })
  }
  const abort = () => fail(createError({statusCode: 400, message: 'Media upload aborted'}))
  let disposed = false
  const dispose = async () => {
    if (disposed) return
    // Keep admission if owned disk cleanup fails; do not falsely free the quota.
    if (directory) {
      try {await rm(directory, {recursive: true, force: true, maxRetries: 5, retryDelay: 50})}
      catch {throw createError({statusCode: 503, message: 'Media staging cleanup requires recovery'})}
    }
    disposed = true; lease.release()
  }
  try {
    const length = Number(request.headers['content-length'])
    if (Number.isFinite(length) && length > limits.requestBytes) throw createError({statusCode: 413, message: 'Media request exceeds byte limit'})
    const root = options.root ?? resolve('storage/media-stage')
    await mkdir(root, {recursive: true})
    const disk = await statfs(root)
    if (disk.bavail * disk.bsize < limits.reserveBytes + limits.requestBytes) throw createError({statusCode: 503, message: 'Insufficient media staging disk space'})
    directory = await mkdtemp(join(root, 'upload-'))
    await markOwnedStage(directory)
    try {parser = Busboy({headers: request.headers, limits: {files: limits.files, fileSize: limits.fileBytes + 1, fields: 1, fieldSize: 1024, parts: limits.files + 2, headerPairs: 32}})}
    catch {throw createError({statusCode: 400, message: 'Invalid media multipart body'})}
    const visibility = {value: 'public' as 'public' | 'private'}
    let fieldSeen = false, total = 0
    meter = new Transform({transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      if (total > limits.requestBytes) callback(createError({statusCode: 413, message: 'Media request exceeds byte limit'}))
      else callback(null, chunk)
    }})
    meter.on('error', fail)
    const done = new Promise<void>(resolve => {parser!.once('close', resolve); parser!.on('error', () => fail(createError({statusCode: 400, message: 'Invalid media multipart body'})))})
    parser.on('field', (name, value, info) => {
      if (name !== 'visibility' || fieldSeen || info.valueTruncated || !['public', 'private'].includes(value)) {fail(createError({statusCode: 400, message: 'Invalid media field'})); return}
      fieldSeen = true; visibility.value = value as 'public' | 'private'
    })
    parser.on('file', (_name, stream, info) => {
      stream.on('error', () => {})
      const index = files.length
      if (!info.filename || info.filename.length > 255 || index >= limits.files) {stream.resume(); fail(createError({statusCode: 400, message: 'Invalid media file part'})); return}
      const file: StagedMediaFile = {path: join(directory!, `file-${index}`), hash: '', size: 0, originalName: info.filename, mimeType: info.mimeType}
      files.push(file); active.add(stream)
      stream.once('limit', () => fail(createError({statusCode: 413, message: 'Media file exceeds byte limit'})))
      const hash = createHash('sha256')
      const counter = new Transform({transform(chunk: Buffer, _encoding, callback) {
        try {
          if (file.size + chunk.length > limits.fileBytes) throw createError({statusCode: 413, message: 'Media file exceeds byte limit'})
          lease.add(chunk.length); file.size += chunk.length; hash.update(chunk); callback(null, chunk)
        } catch (error) {callback(error as Error)}
      }})
      const task = pipeline(stream, counter, createWriteStream(file.path, {flags: 'wx', mode: 0o600}))
        .then(() => {file.hash = hash.digest('hex')})
        .catch(error => fail(error instanceof Error && 'statusCode' in error ? error : createError({statusCode: 503, message: 'Media staging write failed'})))
        .finally(() => {active.delete(stream)})
      writes.push(task)
    })
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) parser.once(event, () => fail(createError({statusCode: 413, message: 'Media multipart part limit exceeded'})))
    request.once('aborted', abort); request.once('error', abort); options.signal?.addEventListener('abort', abort, {once: true})
    timer = setTimeout(() => fail(createError({statusCode: 408, message: 'Media upload deadline exceeded'})), limits.deadlineMs)
    if (request.aborted || options.signal?.aborted) abort()
    else request.pipe(meter).pipe(parser)
    await done; await Promise.allSettled(writes)
    if (failure) throw failure
    if (!files.length || files.some(file => !file.size)) throw createError({statusCode: 400, message: 'No files provided'})
    return {files, visibility: visibility.value, directory, dispose}
  } catch (error) {
    fail(error instanceof Error ? error : new Error('Media ingestion failed'))
    await Promise.allSettled(writes)
    await dispose()
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({statusCode: 503, message: 'Media ingestion unavailable'})
  } finally {
    clearTimeout(timer); request.off('aborted', abort); request.off('error', abort); options.signal?.removeEventListener('abort', abort)
    request.unpipe(meter); meter?.unpipe(parser); meter?.destroy(); parser?.destroy()
    await Promise.allSettled(writes)
  }
}
