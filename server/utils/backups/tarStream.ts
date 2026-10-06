import { createReadStream, createWriteStream } from 'node:fs'
import { opendir, mkdir, open, rm, lstat } from 'node:fs/promises'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { Readable, Transform } from 'node:stream'
import * as tar from 'tar'
import { BACKUP_LIMITS, byteLimit, checkDisk, regularFile } from './streams'

export const ORIGINAL_PATH = /^\d{4}\/(?:0[1-9]|1[0-2])\/[a-f0-9]{64}\.[a-z0-9]{1,10}$/i
const DIRECTORY = /^(?:\d{4}|\d{4}\/(?:0[1-9]|1[0-2]))\/?$/

export async function createMediaTar(paths: string[], cwd: string, outPath: string, gzipLevel = 1, onProgress?: (processed: number, total: number) => void): Promise<void> {
  if (paths.length > BACKUP_LIMITS.mediaEntries || new Set(paths).size !== paths.length) throw new Error('Media entry budget exceeded or duplicate originals')
  let bytes = 0
  for (const rel of paths) {
    if (!ORIGINAL_PATH.test(rel)) throw new Error('Unsupported original media path')
    bytes += await regularFile(path.join(cwd, rel), BACKUP_LIMITS.mediaBytes)
    if (bytes > BACKUP_LIMITS.mediaBytes) throw new Error('Media byte budget exceeded')
  }
  await checkDisk(path.dirname(outPath), bytes)
  let processed = 0
  // tar.c rejects []; a POSIX empty archive is two zero blocks, gzipped.
  const source = paths.length ? tar.c({cwd, portable: true, noDirRecurse: true, filter() {onProgress?.(++processed, paths.length); return true}}, paths) : Readable.from([Buffer.alloc(1024)])
  await pipeline(source, byteLimit(BACKUP_LIMITS.mediaBytes), createGzip({level: gzipLevel}), byteLimit(BACKUP_LIMITS.mediaBytes, path.dirname(outPath)), createWriteStream(outPath, {flags: 'wx', mode: 0o600}), {signal: AbortSignal.timeout(BACKUP_LIMITS.deadlineMs)})
  const file = await open(outPath, 'r+')
  try {await file.sync()} finally {await file.close()}
  if (!paths.length) onProgress?.(0, 0)
}

/** Must target a new owned stage, never live uploads. All unsupported entries
 * are fatal, not silently filtered. Explicit gunzip caps actual expansion. */
export async function extractMediaTar(srcPath: string, destRoot: string, limits = {bytes: BACKUP_LIMITS.mediaBytes, entries: BACKUP_LIMITS.mediaEntries * 2}): Promise<number> {
  if (!Number.isSafeInteger(limits.bytes) || limits.bytes < 1 || limits.bytes > BACKUP_LIMITS.mediaBytes || !Number.isSafeInteger(limits.entries) || limits.entries < 1 || limits.entries > BACKUP_LIMITS.mediaEntries * 2) throw new Error('Invalid archive limits')
  await regularFile(srcPath, BACKUP_LIMITS.mediaBytes)
  await mkdir(destRoot, {recursive: true, mode: 0o700})
  if (!(await lstat(destRoot)).isDirectory() || (await lstat(destRoot)).isSymbolicLink()) throw new Error('Unsafe media stage')
  let files = 0, entries = 0, bytes = 0, expandedBytes = 0
  let allZero = true
  const emptyProbe = new Transform({transform(chunk: Buffer, _encoding, callback) {
    expandedBytes += chunk.length
    if (allZero && chunk.some(byte => byte !== 0)) allZero = false
    callback(null, chunk)
  }})
  const names = new Set<string>()
  const extractor = tar.x({cwd: path.resolve(destRoot), strict: false, preservePaths: false, noChmod: true, noMtime: true,
    onwarn(code) {
      // tar 7 calls canonical zero-block empty archives unrecognized. Permit
      // ONLY verified empty POSIX blocks; every other parser warning is fatal.
      if (code === 'TAR_BAD_ARCHIVE' && allZero && expandedBytes >= 1024 && expandedBytes <= 10240 && expandedBytes % 512 === 0) return
      extractor.abort(new Error(`Invalid media archive: ${code}`))
    }, filter(name, entry) {
    entries++
    const type = (entry as tar.ReadEntry).type
    const valid = type === 'File' ? ORIGINAL_PATH.test(name) : type === 'Directory' && DIRECTORY.test(name)
    const normalized = name.replace(/\/$/, '')
    bytes += entry.size
    if (!valid || !Number.isSafeInteger(entry.size) || entry.size < 0 || names.has(normalized) || entries > limits.entries || bytes > limits.bytes) {
      extractor.abort(new Error('Unsafe, duplicate or oversized media archive entry'))
      return false
    }
    names.add(normalized)
    if (type === 'File') files++
    return true
  }})
  await checkDisk(destRoot)
  const input = createReadStream(srcPath), gunzip = createGunzip()
  try {await pipeline(input, gunzip, byteLimit(limits.bytes, destRoot), emptyProbe, extractor)}
  catch (error) {
    // Unpack marks TAR_BAD_ARCHIVE non-recoverable even when onwarn permits
    // it. Accept only complete CRC-checked canonical zero-block archives.
    if (!(error instanceof Error && error.message === 'TAR_BAD_ARCHIVE: Unrecognized archive format' && gunzip.readableEnded && allZero && expandedBytes >= 1024 && expandedBytes <= 10240 && expandedBytes % 512 === 0 && files === 0 && entries === 0)) throw error
  }
  return files
}

/** Finite library limit; incremental opendir avoids a full directory read. */
export async function collectOriginalPaths(root: string): Promise<string[]> {
  const paths: string[] = []
  let entries = 0, bytes = 0
  async function walk(directory: string, depth: number) {
    if (depth > 2) throw new Error('Unsupported original media layout')
    let handle
    try {handle = await opendir(directory)} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT' && depth === 0) return; throw error}
    for await (const entry of handle) {
      if (++entries > BACKUP_LIMITS.mediaEntries * 2) throw new Error('Original media entry budget exceeded')
      const full = path.join(directory, entry.name), rel = path.relative(root, full).replace(/\\/g, '/')
      if (entry.isDirectory() && DIRECTORY.test(rel)) await walk(full, depth + 1)
      else if (entry.isFile() && ORIGINAL_PATH.test(rel)) {
        bytes += await regularFile(full, BACKUP_LIMITS.mediaBytes)
        if (bytes > BACKUP_LIMITS.mediaBytes || paths.length >= BACKUP_LIMITS.mediaEntries) throw new Error('Original media budget exceeded')
        paths.push(rel)
      } else throw new Error('Unsupported file/symlink in original media library')
    }
  }
  await walk(root, 0)
  return paths
}
export async function clearDirectory(directory: string): Promise<void> {
  let handle
  try {handle = await opendir(directory)} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error}
  for await (const entry of handle) await rm(path.join(directory, entry.name), {recursive: true, force: true})
}
