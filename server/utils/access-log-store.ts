import { createHash, randomUUID } from 'node:crypto'
import { constants, createWriteStream, mkdirSync } from 'node:fs'
import type { Stats, WriteStream } from 'node:fs'
import { lstat, open, readdir, rename, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { writeConsoleEntry } from './log-console'
import type { AccessLogEntry } from '~/types/logging'

const MAX_PENDING_BYTES = 8 * 1024 * 1024
const WARN_INTERVAL_MS = 60_000
const FAILURE_BACKOFF_MS = 60_000

export function accessLogDir(): string {
  return resolve(process.cwd(), process.env.ACCESS_LOG_DIR || 'storage/logs/access')
}

export function fileNameForDate(d: Date): string {
  return `access-${d.toISOString().slice(0, 10)}.ndjson`
}

/** Entries reaching this store have already been redacted and trimmed by logAccess. */
export function serializeAccessLog(entry: AccessLogEntry, now = new Date()): string {
  return JSON.stringify(accessLogLine(entry, now))
}

function accessLogLine(entry: AccessLogEntry, now: Date) {
  const date = entry.timestamp ? new Date(entry.timestamp) : now
  const timestamp = Number.isNaN(date.getTime()) ? now : date
  return {
    ts: timestamp.toISOString(),
    id: entry.request_id || randomUUID(),
    m: entry.method,
    p: entry.path,
    s: entry.status_code,
    d: entry.response_time_ms,
    ip: entry.ip ?? undefined,
    ua: entry.user_agent ?? undefined,
    ref: entry.referrer ?? undefined,
    q: entry.query_params && Object.keys(entry.query_params).length ? entry.query_params : undefined
  }
}

interface StoreOptions {
  dir?: () => string
  now?: () => Date
  mkdir?: (path: string) => void
  open?: (path: string) => WriteStream
  warn?: (message: string, context?: Record<string, unknown>) => void
}

/** Injectable clock/filesystem for isolated stores and deterministic failure tests. No DB dependencies. */
export function createAccessLogStore(options: StoreOptions = {}) {
  const now = options.now ?? (() => new Date())
  const dir = options.dir ?? accessLogDir
  const mkdir = options.mkdir ?? ((path: string) => { mkdirSync(path, { recursive: true }) })
  const open = options.open ?? ((path: string) => createWriteStream(path, { flags: 'a' }))
  const warn = options.warn ?? ((msg, ctx) => writeConsoleEntry({ level: 'warn', kind: 'app', msg, ctx }))
  type OpenFile = { stream: WriteStream, name: string, done: Promise<void> }
  const pending = new Set<OpenFile>()
  let current: OpenFile | undefined
  let readyDir: string | undefined
  let failures = 0
  let blockedUntil = 0
  let lastFailureWarn = -Infinity
  let lastDropWarn = -Infinity
  let droppedSinceLastWarn = 0
  let closed = false
  let closing: Promise<void> | undefined
  let maintaining: Promise<{ compressed: number; deleted: number }> | undefined
  let purging: Promise<number> | undefined
  let mutation: Promise<void> | undefined
  let paused = false
  let queuedBytes = 0
  const queued: Array<{ name: string; line: string }> = []

  // All administrative mutations share a queue; a purge cannot race gzip/retention.
  function mutate<T>(work: () => Promise<T>): Promise<T> {
    const result = mutation ? mutation.then(work) : work()
    const settled = result.then(() => {}, () => {})
    mutation = settled
    void settled.then(() => { if (mutation === settled) mutation = undefined })
    return result
  }

  async function drain(files: OpenFile[]) {
    for (const file of files) {
      if (!file.stream.writableEnded && !file.stream.destroyed) file.stream.end()
    }
    await Promise.all(files.map(file => file.done))
  }

  function safeWarn(message: string, context?: Record<string, unknown>) {
    try { warn(message, context) } catch { /* Diagnostics must not break logging. */ }
  }

  function failed(error: unknown, time: number) {
    readyDir = undefined
    failures += 1
    if (failures >= 2) blockedUntil = time + FAILURE_BACKOFF_MS
    if (time - lastFailureWarn >= WARN_INTERVAL_MS) {
      lastFailureWarn = time
      let message = 'Unknown error'
      try { if (error instanceof Error) message = error.message } catch { /* Exotic thrown values are unsafe to inspect. */ }
      safeWarn('[logging] access log file write failed; entries may be lost', {
        error: message,
        backoff_ms: failures >= 2 ? FAILURE_BACKOFF_MS : 0
      })
    }
  }

  function drop(time: number) {
    droppedSinceLastWarn += 1
    if (time - lastDropWarn >= WARN_INTERVAL_MS) {
      lastDropWarn = time
      safeWarn('[logging] access log file queue full; dropping entries', { dropped: droppedSinceLastWarn })
      droppedSinceLastWarn = 0
    }
  }

  function openFile(name: string): OpenFile {
    const directory = dir()
    if (readyDir !== directory) {
      mkdir(directory)
      readyDir = directory
    }
    const stream = open(resolve(directory, name))
    let complete!: () => void
    const file: OpenFile = { stream, name, done: new Promise<void>(resolve => { complete = resolve }) }
    pending.add(file)
    stream.once('close', () => {
      if (current === file) current = undefined
      pending.delete(file)
      complete()
    })
    stream.on('error', (error) => {
      // An older, rotating stream may fail after its replacement has opened.
      if (current === file) current = undefined
      failed(error, now().getTime())
      stream.destroy()
    })
    return file
  }

  function append(entry: AccessLogEntry): void {
    if (closed) return
    let time = 0
    try {
      const date = now()
      time = date.getTime()
      if (time < blockedUntil) return
      const row = accessLogLine(entry, date)
      const line = `${JSON.stringify(row)}\n`
      // The serialized timestamp is also the day key (UTC), including explicit timestamps.
      const name = fileNameForDate(new Date(row.ts))
      if (paused) {
        const bytes = Buffer.byteLength(line)
        if (queuedBytes + bytes > MAX_PENDING_BYTES) { drop(time); return }
        queued.push({ name, line })
        queuedBytes += bytes
        return
      }
      writeLine(name, line, time)
    } catch (error) {
      failed(error, time)
    }
  }

  function writeLine(name: string, line: string, time: number) {
    // Replayed purge entries must honor the same IO circuit breaker as append.
    if (time < blockedUntil) return
    let writing: WriteStream | undefined
    try {
      if (current?.name !== name) {
        const previous = current
        current = undefined
        writing = previous?.stream
        writing?.end()
        writing = undefined
        current = openFile(name)
      }
      const stream = current.stream
      // Include the next line in the budget so one unusually large entry cannot bypass it.
      if (stream.writableLength + Buffer.byteLength(line) > MAX_PENDING_BYTES) {
        drop(time)
        return
      }
      writing = stream
      stream.write(line, (error) => {
        if (!error && current?.stream === stream) {
          failures = 0
          blockedUntil = 0
        }
        // The error event owns failure reporting, not the per-write callback.
      })
    } catch (error) {
      // Bad input must not destroy a healthy stream containing earlier entries.
      if (current?.stream === writing) current = undefined
      writing?.destroy()
      failed(error, time)
    }
  }

  function close(): Promise<void> {
    if (closing) return closing
    closed = true
    const finish = async () => {
      current = undefined
      const files = [...pending]
      for (const file of files) {
        try {
          if (!file.stream.writableEnded && !file.stream.destroyed) file.stream.end()
        } catch (error) {
          failed(error, now().getTime())
          file.stream.destroy()
        }
      }
      // Wait for rotated streams too, and for descriptor closure, not just 'finish'.
      await Promise.all(files.map(file => file.done))
    }
    closing = mutation ? mutation.then(finish) : finish()
    return closing
  }

  function maintain(now: Date, retentionDays: number): Promise<{ compressed: number; deleted: number }> {
    if (maintaining) return maintaining
    maintaining = mutate(async () => {
      validateMaintenance(now, retentionDays)
      const today = fileNameForDate(now)
      // An idle writer can still hold yesterday's descriptor at 00:05. Drain
      // it before reading/unlinking; today's writer remains append-only/open.
      const oldFiles = [...pending].filter(file => file.name < today)
      if (current && oldFiles.includes(current)) current = undefined
      await drain(oldFiles)
      return maintainFiles(dir(), now, retentionDays)
    }).finally(() => { maintaining = undefined })
    return maintaining
  }

  function purge(): Promise<number> {
    if (purging) return purging
    purging = mutate(async () => {
      paused = true
      const activeName = current?.name
      current = undefined
      try {
        await drain([...pending])
        const directory = dir()
        if (!(await statIfExists(directory))?.isDirectory()) return 0
        // Lazy import avoids the reader's accessLogDir dependency cycle.
        const { createAccessLogReader } = await import('./access-log-reader')
        const stats = await createAccessLogReader({ dir: () => directory }).accessStats()
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const match = ACCESS_FILE_PATTERN.exec(entry.name)
          if (!entry.isFile() || !match || !validFileDay(match[1]!)) continue
          const path = resolve(directory, entry.name)
          if (!(await statIfExists(path))?.isFile()) continue
          if (entry.name === activeName) {
            const file = await openRegularFile(path, constants.O_RDWR)
            try { await file.truncate(0) } finally { await file.close() }
          } else await unlink(path)
        }
        const cache = resolve(directory, '.index.json')
        if ((await statIfExists(cache))?.isFile()) await unlink(cache)
        return stats.count
      } finally {
        paused = false
        // New requests during purge are bounded, snapshotted and replayed after
        // deletion (also on failure). The active filename is reopened lazily.
        const buffered = queued.splice(0)
        queuedBytes = 0
        for (const row of buffered) writeLine(row.name, row.line, now().getTime())
      }
    }).finally(() => { purging = undefined })
    return purging
  }

  /** Brief exclusive filesystem mutation: drain descriptors and replay concurrent requests. */
  function exclusive<T>(work: (directory: string) => Promise<T>): Promise<T> {
    return mutate(async () => {
      if (closed) throw new Error('Access log store is closed')
      paused = true
      current = undefined
      try {
        await drain([...pending])
        return await work(dir())
      } finally {
        paused = false
        const buffered = queued.splice(0)
        queuedBytes = 0
        for (const row of buffered) writeLine(row.name, row.line, now().getTime())
      }
    })
  }

  return { append, close, maintain, purge, exclusive }
}

const store = createAccessLogStore()

/** Synchronous fire-and-forget API; serialization/open/write failures never escape. */
export function appendAccessLog(entry: AccessLogEntry): void {
  store.append(entry)
}

export function closeAccessLogStore(): Promise<void> {
  return store.close()
}

export function maintainAccessLogFiles(now: Date, retentionDays: number): Promise<{ compressed: number; deleted: number }> {
  return store.maintain(now, retentionDays)
}

export function purgeAccessLogFiles(): Promise<number> {
  return store.purge()
}

export function withAccessLogMutation<T>(work: (directory: string) => Promise<T>): Promise<T> {
  return store.exclusive(work)
}

const ACCESS_FILE_PATTERN = /^access-(\d{4}-\d{2}-\d{2})\.ndjson(\.gz)?$/

function validFileDay(day: string) {
  const time = Date.parse(`${day}T00:00:00.000Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day
}

function validateMaintenance(now: Date, retentionDays: number) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid access log maintenance date')
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error('Access log retention days must be an integer between 1 and 3650')
  }
}

async function statIfExists(path: string) {
  try { return await lstat(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function openRegularFile(path: string, flags = constants.O_RDONLY) {
  const before = await lstat(path)
  if (!before.isFile()) throw new Error('Access log maintenance requires a regular file')
  const file = await open(path, flags | (constants.O_NOFOLLOW || 0))
  const after = await file.stat()
  if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) {
    await file.close()
    throw new Error('Access log file changed while opening')
  }
  return file
}

async function digestFile(path: string, gzip: boolean): Promise<string> {
  const file = await openRegularFile(path)
  const hash = createHash('sha256')
  const sink = new Writable({ write(chunk, _encoding, done) { hash.update(chunk); done() } })
  try {
    const source = file.createReadStream({ autoClose: false })
    if (gzip) await pipeline(source, createGunzip(), sink)
    else await pipeline(source, sink)
    return hash.digest('hex')
  } finally { await file.close() }
}

async function assertUnchangedFile(path: string, original: Stats) {
  const current = await lstat(path)
  if (!current.isFile() || current.dev !== original.dev || current.ino !== original.ino
    || current.size !== original.size || current.mtimeMs !== original.mtimeMs) {
    throw new Error('Access log source changed during compression; keeping plain file')
  }
}

async function compressFile(path: string): Promise<boolean> {
  const original = await lstat(path)
  const destination = `${path}.gz`
  const temp = `${destination}.tmp`
  const existing = await statIfExists(destination)
  const leftover = await statIfExists(temp)
  // Never open, overwrite, or unlink symlinks (including crash temp paths).
  if ((existing && !existing.isFile()) || (leftover && !leftover.isFile())) return false
  if (existing) {
    let digest: string | undefined
    try { digest = await digestFile(destination, true) } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'Z_DATA_ERROR' && code !== 'Z_BUF_ERROR') throw error
    }
    // Verify the trailer AND content: a valid but stale gzip must not discard
    // extra plain rows written after a crash or by a timestamped append.
    if (digest && digest === await digestFile(path, false)) {
      await assertUnchangedFile(path, original)
      if (leftover) await unlink(temp)
      await unlink(path)
      return true
    }
  }
  if (leftover) await unlink(temp)
  const source = await openRegularFile(path)
  let output: Awaited<ReturnType<typeof open>> | undefined
  let created = false
  let published = false
  try {
    output = await open(temp, 'wx', 0o600)
    created = true
    // Keep ownership of the descriptor for fsync. A FileHandle WriteStream
    // with autoClose:false retains a reference that can deadlock close().
    const sink = new Writable({
      write(chunk, _encoding, done) { void output!.writeFile(chunk).then(() => done(), done) }
    })
    await pipeline(source.createReadStream({ autoClose: false }), createGzip(), sink)
    await output.sync()
    await output.close()
    output = undefined
    await assertUnchangedFile(path, original)
    await rename(temp, destination)
    published = true
    await unlink(path)
    return true
  } finally {
    await source.close()
    await output?.close()
    // Never remove a pre-existing path if exclusive creation failed.
    if (!published && created) await unlink(temp)
  }
}

async function maintainFiles(directory: string, now: Date, retentionDays: number) {
  const report = { compressed: 0, deleted: 0 }
  const directoryStat = await statIfExists(directory)
  if (!directoryStat || !directoryStat.isDirectory()) return report
  const today = now.toISOString().slice(0, 10)
  const cutoff = new Date(`${today}T00:00:00.000Z`).getTime() - retentionDays * 86_400_000
  const failures: Error[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const match = ACCESS_FILE_PATTERN.exec(entry.name)
    if (!entry.isFile() || !match) continue
    const day = match[1]!
    const dayTime = new Date(`${day}T00:00:00.000Z`).getTime()
    // Reject impossible calendar dates as well as unknown filename formats.
    if (!Number.isFinite(dayTime) || new Date(dayTime).toISOString().slice(0, 10) !== day) continue
    const path = resolve(directory, entry.name)
    try {
      if (!(await statIfExists(path))?.isFile()) continue
      // Expired files need no compression. Counts describe deleted physical
      // files, not rows; the exact cutoff day is retained.
      if (dayTime < cutoff) {
        await unlink(path)
        report.deleted += 1
      } else if (!match[2] && day < today && await compressFile(path)) {
        report.compressed += 1
      }
    } catch (error) {
      failures.push(new Error(`${entry.name}: ${error instanceof Error ? error.message : 'Unknown error'}`))
    }
  }
  if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join('; '))
  return report
}
