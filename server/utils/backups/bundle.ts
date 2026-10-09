import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { link, lstat, mkdir, open, readFile, rm, type FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import * as tar from 'tar'
import { createError } from 'h3'
import { BACKUP_LIMITS, byteLimit, checkDisk, regularFile } from './streams'
import { parseFullManifest, type FullManifest } from './manifest'
import { syncDirectory } from './jobMutex'

export const BUNDLE_MEMBERS = ['db.surql.gz', 'media.tar.gz', 'manifest.json'] as const
const payload = BACKUP_LIMITS.compressedBytes + BACKUP_LIMITS.mediaBytes + BACKUP_LIMITS.manifestBytes
export const BUNDLE_LIMITS = Object.freeze({
  encodedBytes: payload + 64 * 1024 + 8 * 1024 * 1024,
  expandedBytes: payload + 64 * 1024,
  dbBytes: BACKUP_LIMITS.compressedBytes, mediaBytes: BACKUP_LIMITS.mediaBytes, manifestBytes: BACKUP_LIMITS.manifestBytes,
  deadlineMs: BACKUP_LIMITS.deadlineMs,
})
export type BundleLimits = typeof BUNDLE_LIMITS
export interface BundleOptions {limits?: Partial<BundleLimits>, signal?: AbortSignal, reserveBytes?: number}
function limitsFor(options: BundleOptions): BundleLimits {
  const limits = {...BUNDLE_LIMITS, ...options.limits}
  for (const key of Object.keys(limits) as (keyof BundleLimits)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > BUNDLE_LIMITS[key]) throw new Error('Invalid bundle budget')
  }
  return limits
}
function signalFor(options: BundleOptions, limits: BundleLimits) {
  const deadline = AbortSignal.timeout(limits.deadlineMs)
  return options.signal ? AbortSignal.any([deadline, options.signal]) : deadline
}
async function safeDirectory(directory: string) {
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe backup directory')
}
export async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), new Writable({write(chunk, _encoding, callback) {hash.update(chunk); callback()}}), {signal: AbortSignal.timeout(BACKUP_LIMITS.deadlineMs)})
  return hash.digest('hex')
}
export async function readManifest(file: string): Promise<FullManifest> {
  await regularFile(file, BACKUP_LIMITS.manifestBytes)
  return parseFullManifest(await readFile(file))
}

/** Fixed members, bounded streams, exclusive durable publication. A hard link
 * publishes without rename-overwriting an existing immutable ready bundle. */
export async function packBundle(directory: string, options: BundleOptions = {}) {
  const limits = limitsFor(options), signal = signalFor(options, limits)
  await safeDirectory(directory)
  const caps = [limits.dbBytes, limits.mediaBytes, limits.manifestBytes]
  const sizes: number[] = []
  for (const [index, member] of BUNDLE_MEMBERS.entries()) sizes.push(await regularFile(join(directory, member), caps[index]!))
  const manifest = await readManifest(join(directory, 'manifest.json'))
  if (sizes[0] !== manifest.db_size_bytes || sizes[1] !== manifest.media_size_bytes || await hashFile(join(directory, BUNDLE_MEMBERS[0])) !== manifest.sha256_db || await hashFile(join(directory, BUNDLE_MEMBERS[1])) !== manifest.sha256_media) throw new Error('Backup member checksum/size mismatch')
  await checkDisk(directory, sizes.reduce((sum, size) => sum + size, 0) + 64 * 1024, options.reserveBytes)
  const part = join(directory, 'backup.tar.gz.part'), target = join(directory, 'backup.tar.gz')
  const hash = createHash('sha256')
  let bytes = 0, created = false
  const meter = new Transform({transform(chunk: Buffer, _encoding, callback) {bytes += chunk.length; hash.update(chunk); callback(null, chunk)}})
  const output = createWriteStream(part, {flags: 'wx', mode: 0o600})
  output.once('open', () => {created = true})
  try {
    await pipeline(tar.c({cwd: directory, portable: true, noPax: true, noDirRecurse: true}, [...BUNDLE_MEMBERS]), byteLimit(limits.expandedBytes), createGzip({level: 1}), byteLimit(limits.encodedBytes, directory), meter, output, {signal})
    const file = await open(part, 'r+')
    try {await file.sync()} finally {await file.close()}
    signal.throwIfAborted()
    await link(part, target)
    await syncDirectory(directory)
    await rm(part)
    await syncDirectory(directory)
    return {format_version: 1, bundle_filename: 'backup.tar.gz', bundle_size_bytes: bytes, bundle_sha256: hash.digest('hex')}
  } catch (error) {
    output.destroy()
    if (!output.closed) await new Promise<void>(resolve => output.once('close', resolve))
    if (created) await rm(part, {force: true}).catch(() => {})
    // A possibly published target is preserved, even after a sync failure.
    throw error
  }
}

function octal(field: Buffer): number {
  const value = field.toString('utf8')
  if (!/^ *[0-7]+[\0 ]*$/.test(value)) throw new Error('Unsupported tar numeric metadata')
  const result = Number.parseInt(value, 8)
  if (!Number.isSafeInteger(result)) throw new Error('Invalid tar size')
  return result
}
/** A bounded framing reader in front of extraction. tar.Parse silently accepts
 * trailing archives and metadata; the portable envelope deliberately does not.
 * Only ordinary short ustar headers and zero termination/padding are accepted.
 * Paths are never used as destinations; at most one 512-byte header is retained. */
class BundleWriter extends Writable {
  private header = Buffer.alloc(512)
  private headerBytes = 0
  private remaining = 0
  private padding = 0
  private zeros = 0
  private seen = new Set<string>()
  private file?: FileHandle
  private work?: Promise<void>
  constructor(private directory: string, private limits: BundleLimits) {super()}
  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.work = this.consume(chunk)
    void this.work.then(() => callback(), callback)
  }
  private async consume(chunk: Buffer) {
    let offset = 0
    while (offset < chunk.length) {
      if (this.destroyed) throw new Error('Bundle unpack aborted')
      if (this.remaining) {
        const length = Math.min(this.remaining, chunk.length - offset)
        let written = 0
        while (written < length) {
          const result = await this.file!.write(chunk, offset + written, length - written)
          if (!result.bytesWritten) throw new Error('Bundle member write failed')
          written += result.bytesWritten
        }
        this.remaining -= length; offset += length
        if (!this.remaining) {await this.file!.sync(); await this.file!.close(); this.file = undefined}
      } else if (this.padding) {
        const length = Math.min(this.padding, chunk.length - offset)
        if (chunk.subarray(offset, offset + length).some(byte => byte !== 0)) throw new Error('Invalid tar member padding')
        this.padding -= length; offset += length
      } else {
        const length = Math.min(512 - this.headerBytes, chunk.length - offset)
        chunk.copy(this.header, this.headerBytes, offset, offset + length)
        this.headerBytes += length; offset += length
        if (this.headerBytes !== 512) continue
        this.headerBytes = 0
        if (this.header.every(byte => byte === 0)) {
          this.zeros += 512
          if (this.zeros > 64 * 1024) throw new Error('Excess tar trailing padding')
          continue
        }
        if (this.zeros) throw new Error('Trailing archive data')
        const nameField = this.header.subarray(0, 100)
        const end = nameField.indexOf(0)
        if (end < 0 || nameField.subarray(end).some(byte => byte !== 0)) throw new Error('Invalid tar member name')
        const name = nameField.subarray(0, end).toString('utf8')
        const index = BUNDLE_MEMBERS.indexOf(name as typeof BUNDLE_MEMBERS[number])
        const size = octal(this.header.subarray(124, 136))
        let checksum = 0
        for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : this.header[i]!
        if (checksum !== octal(this.header.subarray(148, 156)) || this.header.subarray(257, 263).toString('utf8') !== 'ustar\0' || this.header.subarray(263, 265).toString('utf8') !== '00') throw new Error('Invalid or unsupported tar header')
        if (index < 0 || this.seen.has(name) || this.seen.size >= 3 || ![0, 48].includes(this.header[156]!) || this.header.subarray(157, 257).some(byte => byte !== 0) || this.header.subarray(345).some(byte => byte !== 0)) throw new Error('Unsafe, duplicate or unexpected bundle entry')
        if (size < 1 || size > [this.limits.dbBytes, this.limits.mediaBytes, this.limits.manifestBytes][index]!) throw new Error('Bundle member byte budget exceeded')
        this.seen.add(name)
        this.remaining = size; this.padding = (512 - size % 512) % 512
        this.file = await open(join(this.directory, BUNDLE_MEMBERS[index]!), 'wx', 0o600)
      }
    }
  }
  override _final(callback: (error?: Error | null) => void) {
    callback(this.seen.size !== 3 || this.headerBytes || this.remaining || this.padding || this.zeros < 1024 ? new Error('Missing or truncated bundle members/termination') : undefined)
  }
  override _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    // Destroy is not cancellation of an in-flight open/write/sync. Wait for
    // that operation to settle before closing/removing the owned stage.
    void (async () => {
      await this.work?.catch(() => {})
      const file = this.file; this.file = undefined
      await file?.close()
    })().then(() => callback(error), callback)
  }
}

/** Owns a fresh directory. All writers close before removing only that stage. */
export async function unpackBundle(source: string, directory: string, options: BundleOptions = {}) {
  const limits = limitsFor(options), signal = signalFor(options, limits)
  await safeDirectory(dirname(directory))
  await regularFile(source, limits.encodedBytes)
  let created = false
  try {
    await mkdir(directory, {mode: 0o700}); created = true
    await checkDisk(directory, 0, options.reserveBytes)
    await pipeline(createReadStream(source), byteLimit(limits.encodedBytes), createGunzip(), byteLimit(limits.expandedBytes, directory), new BundleWriter(directory, limits), {signal})
    const manifest = await readManifest(join(directory, 'manifest.json'))
    const dbGzPath = join(directory, 'db.surql.gz'), mediaTarGzPath = join(directory, 'media.tar.gz')
    if (await regularFile(dbGzPath, limits.dbBytes) !== manifest.db_size_bytes || await regularFile(mediaTarGzPath, limits.mediaBytes) !== manifest.media_size_bytes || await hashFile(dbGzPath) !== manifest.sha256_db || await hashFile(mediaTarGzPath) !== manifest.sha256_media) throw new Error('Backup member checksum/size mismatch')
    return {dbGzPath, mediaTarGzPath, manifestBuffer: await readFile(join(directory, 'manifest.json'))}
  } catch (error) {
    if (created) await rm(directory, {recursive: true, force: true, maxRetries: 3, retryDelay: 50})
    if ((error as {statusCode?: number}).statusCode) throw error
    const code = (error as NodeJS.ErrnoException).code, message = error instanceof Error ? error.message : ''
    if (signal.aborted) throw createError({statusCode: signal.reason?.name === 'TimeoutError' ? 408 : 400, message: 'Backup bundle transfer aborted or timed out'})
    if (message.includes('budget')) throw createError({statusCode: 413, message: 'Backup bundle byte/member budget exceeded'})
    if (message.includes('headroom') || (code && !code.startsWith('Z_'))) throw createError({statusCode: 500, message: 'Backup bundle storage unavailable'})
    throw createError({statusCode: 400, message: 'Invalid backup bundle layout, compression or integrity'})
  }
}
