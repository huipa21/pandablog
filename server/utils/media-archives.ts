import { randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, lstat, open, opendir, realpath, rename, unlink } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ZipArchive } from 'archiver'

export interface ArchiveSource { hash: string, original_name: string, original_path: string }
export interface ArchiveMetadata {
  version: 1, policy: 'current-media-v1', ready: true,
  owner: string, epoch: string, hashes: string[], created: number, expires: number,
  bytes: number, sourceBytes: number
}
const NAME = /^media-[a-f0-9]{48}\.zip$/
const MAX_METADATA = 32 * 1024
const DEFAULT_LIMITS = { maxSourceBytes: 512 * 1024 * 1024, maxDiskBytes: 1024 * 1024 * 1024, maxReady: 32, maxEntries: 2000, deadlineMs: 120_000 }

/** Persistent bounded ready metadata; one process/job, no waiting payload queue. */
export class MediaArchiveStore {
  private active = new Set<string>()
  private readers = 0
  private cleaning?: Promise<void>
  private limits: typeof DEFAULT_LIMITS
  constructor(private root: string, private sourceRoot: string, private options: {limits?: Partial<typeof DEFAULT_LIMITS>, now?: () => number, output?: (path: string) => WriteStream} = {}) {
    this.root = resolve(root); this.sourceRoot = resolve(sourceRoot)
    this.limits = {...DEFAULT_LIMITS, ...options.limits}
    for (const [key, value] of Object.entries(this.limits)) if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_LIMITS[key as keyof typeof DEFAULT_LIMITS]) throw new Error('Invalid archive budget')
  }
  private now() { return this.options.now?.() ?? Date.now() }
  path(name: string) { if (!NAME.test(name)) throw new Error('Invalid archive name'); return resolve(this.root, name) }
  private async remove(path: string) { try {await unlink(path)} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error} }
  private async entries(): Promise<string[]> {
    let dir
    try {dir = await opendir(this.root)} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error}
    const names: string[] = []
    for await (const entry of dir) {
      if (names.length >= this.limits.maxEntries) throw new Error('Archive directory capacity exceeded')
      names.push(entry.name)
    }
    return names // finite names only, never file bodies
  }
  private async metadata(name: string): Promise<ArchiveMetadata> {
    const path = `${this.path(name)}.json`
    if (!(await lstat(path)).isFile()) throw new Error('Archive unavailable')
    const file = await open(path, 'r')
    try {
      const buffer = Buffer.alloc(MAX_METADATA + 1)
      const {bytesRead} = await file.read(buffer, 0, buffer.length, 0)
      if (bytesRead > MAX_METADATA) throw new Error('Archive metadata too large')
      const meta = JSON.parse(buffer.subarray(0, bytesRead).toString()) as ArchiveMetadata
      if (meta.version !== 1 || meta.policy !== 'current-media-v1' || meta.ready !== true
        || !/^users:[a-z0-9._-]{3,64}$/.test(meta.owner) || !/^[a-f0-9]{48}$/.test(meta.epoch)
        || !Array.isArray(meta.hashes) || !meta.hashes.length || meta.hashes.length > 200 || new Set(meta.hashes).size !== meta.hashes.length
        || !meta.hashes.every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))
        || !Number.isSafeInteger(meta.created) || !Number.isSafeInteger(meta.expires) || meta.expires <= meta.created || meta.expires - meta.created > 24 * 60 * 60_000
        || !Number.isSafeInteger(meta.sourceBytes) || meta.sourceBytes < 0 || meta.sourceBytes > this.limits.maxSourceBytes
        || !Number.isSafeInteger(meta.bytes) || meta.bytes < 1 || meta.bytes > this.limits.maxSourceBytes + 1024 * 1024) throw new Error('Archive unavailable')
      return meta
    } finally {await file.close()}
  }
  async authorize(name: string, owner: string, epoch: string): Promise<ArchiveMetadata> {
    const meta = await this.metadata(name)
    if (meta.owner !== owner || meta.epoch !== epoch || meta.created > this.now() || meta.expires <= this.now()) throw new Error('Archive unavailable')
    const stat = await lstat(this.path(name))
    if (!stat.isFile() || stat.size !== meta.bytes) throw new Error('Archive unavailable')
    return meta
  }
  diagnostics() {return {activeJobs: this.active.size, activeReaders: this.readers, maxJobs: 1, maxReaders: 8}}
  stream(name: string) {
    const path = this.path(name)
    if (this.readers >= 8) throw new Error('Archive stream capacity exceeded')
    this.readers++
    const stream = createReadStream(path)
    stream.once('close', () => {this.readers--})
    return stream
  }
  async create(sources: ArchiveSource[], owner: string, epoch: string, options: {ttlMs: number, signal?: AbortSignal}): Promise<string> {
    if (this.active.size) throw new Error('Archive job capacity exceeded')
    if (!sources.length || sources.length > 200 || new Set(sources.map(file => file.hash)).size !== sources.length
      || !/^users:[a-z0-9._-]{3,64}$/.test(owner) || !/^[a-f0-9]{48}$/.test(epoch)
      || !Number.isSafeInteger(options.ttlMs) || options.ttlMs < 1 || options.ttlMs > 24 * 60 * 60_000) throw new Error('Invalid archive request')
    const name = `media-${randomBytes(24).toString('hex')}.zip`
    this.active.add(name) // before the first await; cleanup cannot claim this name
    const path = this.path(name), temp = `${path}.part`, metaTemp = `${path}.json.part`
    const controller = new AbortController()
    const abort = () => controller.abort(new Error('Archive request aborted'))
    options.signal?.addEventListener('abort', abort, {once: true})
    if (options.signal?.aborted) abort()
    const timer = setTimeout(() => controller.abort(new Error('Archive job deadline exceeded')), this.limits.deadlineMs)
    let output: WriteStream | undefined
    let archive: InstanceType<typeof ZipArchive> | undefined
    let writing: Promise<void> | undefined
    let published = false, metaCreated = false, tempCreated = false
    try {
      controller.signal.throwIfAborted()
      await mkdir(this.root, {recursive: true, mode: 0o700})
      await this.cleanup()
      const entries = await this.entries()
      let disk = 0, ready = 0
      for (const entry of entries) {
        const stats = await lstat(resolve(this.root, entry))
        if (!stats.isFile()) throw new Error('Unsupported archive storage entry')
        disk += stats.size
        if (NAME.test(entry)) ready++
      }
      if (ready >= this.limits.maxReady) throw new Error('Archive ready capacity exceeded')
      const canonicalRoot = await realpath(this.sourceRoot)
      let sourceBytes = 0
      const files: Array<{path: string, name: string}> = []
      for (const [index, source] of sources.entries()) {
        controller.signal.throwIfAborted()
        if (!/^[a-f0-9]{64}$/.test(source.hash) || typeof source.original_path !== 'string' || source.original_path.length > 1024 || isAbsolute(source.original_path) || source.original_path.replace(/\\/g, '/').split('/').includes('..') || typeof source.original_name !== 'string' || source.original_name.length > 1024) throw new Error('Invalid archive source')
        const candidate = resolve(this.sourceRoot, source.original_path)
        const canonical = await realpath(candidate)
        const suffix = relative(canonicalRoot, canonical)
        const stats = await lstat(candidate)
        if (!stats.isFile() || !suffix || isAbsolute(suffix) || suffix.startsWith('..') || resolve(canonicalRoot, suffix) !== canonical) throw new Error('Invalid archive source')
        sourceBytes += stats.size
        if (sourceBytes > this.limits.maxSourceBytes || disk + sourceBytes + 1024 * 1024 > this.limits.maxDiskBytes) throw new Error('Archive disk/byte budget exceeded')
        const safeName = basename(source.original_name.replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f]/g, '_').slice(0, 180) || 'file'
        files.push({path: canonical, name: `${String(index + 1).padStart(3, '0')}_${safeName}`})
      }
      controller.signal.throwIfAborted()
      archive = new ZipArchive({zlib: {level: 5}, statConcurrency: 1})
      output = (this.options.output ?? (path => createWriteStream(path, {flags: 'wx', mode: 0o600})))(temp)
      output.once('open', () => {tempCreated = true})
      let bytes = 0
      const cap = sourceBytes + 1024 * 1024
      const counter = new Transform({transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length
        callback(bytes > cap ? new Error('Archive output budget exceeded') : null, chunk)
      }})
      archive.on('warning', error => archive?.destroy(error)) // never publish a silently partial ZIP
      writing = pipeline(archive, counter, output, {signal: controller.signal})
      for (const file of files) archive.file(file.path, {name: file.name})
      await Promise.all([writing, archive.finalize()])
      controller.signal.throwIfAborted()
      const created = this.now()
      const metadata: ArchiveMetadata = {version: 1, policy: 'current-media-v1', ready: true, owner, epoch, hashes: sources.map(source => source.hash), created, expires: created + options.ttlMs, sourceBytes, bytes}
      const metadataFile = await open(metaTemp, 'wx', 0o600); metaCreated = true
      try {await metadataFile.writeFile(JSON.stringify(metadata))} finally {await metadataFile.close()}
      await rename(temp, path); published = true
      await rename(metaTemp, `${path}.json`)
      return name
    } catch (error) {
      archive?.abort(); archive?.destroy(); output?.destroy()
      if (writing) await writing.catch(() => {}) // wait for pipeline/output closure, not abandoned finalize
      if (tempCreated) await this.remove(temp)
      if (metaCreated) await this.remove(metaTemp)
      if (published) {await this.remove(path); await this.remove(`${path}.json`)}
      throw error
    } finally {clearTimeout(timer); options.signal?.removeEventListener('abort', abort); this.active.delete(name)}
  }
  cleanup(): Promise<void> {
    if (this.cleaning) return this.cleaning
    const work = this.cleanExpired()
    this.cleaning = work
    void work.finally(() => {if (this.cleaning === work) this.cleaning = undefined}).catch(() => {})
    return work
  }
  private async cleanExpired() {
    for (const entry of await this.entries()) {
      const base = entry.replace(/(?:\.json)?(?:\.part)?$/, '')
      if (!NAME.test(base) || this.active.has(base)) continue
      const path = resolve(this.root, entry)
      let stats
      try {stats = await lstat(path)} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error}
      if (!stats.isFile()) continue
      let expired = this.now() - stats.mtimeMs > 24 * 60 * 60_000
      if (entry === base || entry === `${base}.json`) {
        try {expired ||= (await this.metadata(base)).expires <= this.now()} catch { /* never grant malformed/partial metadata */ }
      } else expired = this.now() - stats.mtimeMs > 10 * 60_000
      if (expired) {
        await this.remove(path)
        if (entry === base || entry === `${base}.json`) {
          await this.remove(entry === base ? `${path}.json` : this.path(base))
        }
      }
    }
  }
}
let store: MediaArchiveStore | undefined
export function mediaArchiveStore() {
  store ??= new MediaArchiveStore(resolve(process.cwd(), 'storage/downloads'), resolve(process.cwd(), 'storage/uploads'))
  return store
}
