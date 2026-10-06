import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, open, rm, statfs } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'

// Conservative finite budgets, not a promise of arbitrary-size DB imports.
export const BACKUP_LIMITS = Object.freeze({ sqlBytes: 128 * 1024 * 1024, compressedBytes: 256 * 1024 * 1024, mediaBytes: 2 * 1024 * 1024 * 1024, mediaEntries: 20_000, manifestBytes: 4 * 1024 * 1024, chainDepth: 64, reserveBytes: 512 * 1024 * 1024, deadlineMs: 300_000 })

export function byteLimit(max: number, directory?: string) {
  if (!Number.isSafeInteger(max) || max < 1) throw new Error('Invalid stream byte limit')
  let bytes = 0, checked = 0
  return new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bytes += chunk.length
    if (bytes > max) callback(new Error('Backup expanded/compressed byte budget exceeded'))
    else if (directory && bytes - checked >= 1024 * 1024) {
      checked = bytes
      void checkDisk(directory).then(() => callback(null, chunk), callback)
    } else callback(null, chunk)
  } })
}
export async function checkDisk(directory: string, additionalBytes = 0, reserve = BACKUP_LIMITS.reserveBytes) {
  const info = await statfs(directory)
  if (info.bavail * info.bsize < additionalBytes + reserve) throw new Error('Insufficient backup disk headroom')
}
export async function regularFile(filePath: string, maxBytes: number) {
  const info = await lstat(filePath)
  if (!info.isFile() || info.size > maxBytes) throw new Error('Unsafe or oversized backup source')
  return info.size
}
/** Exclusive publication, bounded expansion and repeated disk headroom checks. */
export async function streamToFile(source: Readable, target: string, options: { gzip?: boolean, gunzip?: boolean, maxBytes?: number, signal?: AbortSignal, deadlineMs?: number, reserveBytes?: number } = {}) {
  const max = options.maxBytes ?? BACKUP_LIMITS.sqlBytes
  const ms = options.deadlineMs ?? BACKUP_LIMITS.deadlineMs
  if (!Number.isSafeInteger(max) || max < 1 || max > BACKUP_LIMITS.mediaBytes || !Number.isInteger(ms) || ms < 1 || ms > BACKUP_LIMITS.deadlineMs || (options.reserveBytes !== undefined && (!Number.isSafeInteger(options.reserveBytes) || options.reserveBytes < 0))) throw new Error('Invalid backup stream budget')
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, {once: true})
  if (options.signal?.aborted) abort()
  const timer = setTimeout(abort, ms)
  const directory = dirname(target)
  let written = 0, checked = 0
  let output: ReturnType<typeof createWriteStream> | undefined
  let created = false
  source.on('error', () => {})
  const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    written += chunk.length
    if (written > max) {callback(new Error('Backup output byte budget exceeded')); return}
    if (written - checked >= 1024 * 1024) {
      checked = written
      void checkDisk(directory, 0, options.reserveBytes).then(() => callback(null, chunk), callback)
    } else callback(null, chunk)
  } })
  try {
    await checkDisk(directory, 0, options.reserveBytes)
    output = createWriteStream(target, {flags: 'wx', mode: 0o600})
    output.once('open', () => {created = true})
    const codec = options.gunzip ? createGunzip() : options.gzip ? createGzip({level: 6}) : new Transform({transform(chunk, _encoding, callback) {callback(null, chunk)}})
    await pipeline(source, codec, meter, output, {signal: controller.signal})
    const file = await open(target, 'r+')
    try {await file.sync()} finally {await file.close()}
    return written
  } catch (error) {
    source.destroy()
    output?.destroy()
    if (output && !output.closed) await new Promise<void>(resolve => {output!.once('close', resolve)})
    if (created) await rm(target, {force: true}).catch(() => {})
    throw error
  } finally {clearTimeout(timer); options.signal?.removeEventListener('abort', abort)}
}
export async function expandDump(archive: string, target: string, options: Parameters<typeof streamToFile>[2] = {}) {
  await regularFile(archive, BACKUP_LIMITS.compressedBytes)
  return streamToFile(createReadStream(archive), target, {...options, gunzip: true})
}
