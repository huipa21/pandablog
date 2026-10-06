import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { BoundedAdmission } from './admission'

import { createGunzip } from 'node:zlib'
import { accessLogDir } from './access-log-store'
import type { ListLogsResult } from './logging-admin'
import type { AccessHourlyBucket } from '~/types/logging'

const scans = new BoundedAdmission({active: 2, waiting: 8, waitMs: 1_000}, 'Access log scans')
class ScanUnavailable extends Error {statusCode = 503}
export function shutdownAccessLogReader() {return scans.shutdown(5_000)}

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const FILE_PATTERN = /^access-(\d{4}-\d{2}-\d{2})\.ndjson(\.gz)?$/

export interface AccessQuery {
  from?: Date
  to?: Date
  path?: string
  method?: string
  status?: number
  min_status?: number
  max_status?: number
  search?: string
  limit: number
  offset: number
  sort: 'newest' | 'oldest'
  includeTotal: boolean
  signal?: AbortSignal
}

export interface AccessLogRow extends Record<string, unknown> {
  id: string
  timestamp: string
  method: string
  path: string
  status_code: number
  response_time_ms: number
  ip: string | null
  user_agent: string | null
  request_id: string
  query_params: Record<string, unknown> | null
  referrer: string | null
}

export interface AccessFileStats {
  count: number
  oldest: string | null
  newest: string | null
  bytes: number
  files: number
}

type ReaderFs = Pick<typeof nodeFs, 'lstat' | 'readdir' | 'open' | 'rename' | 'unlink'> & Partial<Pick<typeof nodeFs, 'opendir'>>
interface ReaderOptions {
  dir?: () => string
  now?: () => Date
  fs?: ReaderFs
  /** Monotonic clock and lower budgets allow deterministic tests without huge fixtures. */
  clock?: () => number
  maxLines?: number
  maxDurationMs?: number
  maxMatchesPerFile?: number
  maxScanBytes?: number
  maxLineBytes?: number
  maxRetainedBytes?: number
  maxFiles?: number
}
interface DayFile { name: string; day: string; gzip: boolean; stat: Stats }
interface CountCacheEntry { version: 2; size: number; mtimeMs: number; lines: number; dev: number; ino: number; birthtimeMs: number; offset: number; newlines: number; pending: boolean; tail: string }
type CountCache = Record<string, CountCacheEntry>

function validDay(day: string): boolean {
  const time = Date.parse(`${day}T00:00:00.000Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day
}

/** Bad/incomplete lines are ignored, and only the existing public row fields are exposed. */
export function parseAccessLogLine(line: string, day: string): AccessLogRow | null {
  try {
    const value = JSON.parse(line)
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.ts !== 'string' || !Number.isFinite(Date.parse(value.ts))
      || typeof value.id !== 'string' || !value.id
      || typeof value.m !== 'string' || typeof value.p !== 'string'
      || !Number.isInteger(value.s) || value.s < 100 || value.s > 599
      || typeof value.d !== 'number' || !Number.isFinite(value.d) || value.d < 0) return null
    const timestamp = new Date(value.ts).toISOString()
    if (timestamp.slice(0, 10) !== day) return null
    return {
      id: `${day}:${value.id}`,
      timestamp,
      method: value.m,
      path: value.p,
      status_code: value.s,
      response_time_ms: value.d,
      ip: typeof value.ip === 'string' ? value.ip : null,
      user_agent: typeof value.ua === 'string' ? value.ua : null,
      request_id: value.id,
      query_params: value.q && typeof value.q === 'object' && !Array.isArray(value.q) ? value.q : null,
      referrer: typeof value.ref === 'string' ? value.ref : null
    }
  } catch { return null }
}

/** No DB, H3, or module/settings dependencies; callers gate access to these read APIs. */
export function createAccessLogReader(options: ReaderOptions = {}) {
  const dir = options.dir ?? accessLogDir
  const now = options.now ?? (() => new Date())
  const fs = options.fs ?? nodeFs
  const clock = options.clock ?? (() => performance.now())
  const maxLines = options.maxLines ?? 2_000_000
  const maxDurationMs = options.maxDurationMs ?? 3000
  const maxMatches = options.maxMatchesPerFile ?? 10_000
  const maxScanBytes = options.maxScanBytes ?? 128 * 1024 * 1024
  const maxLineBytes = options.maxLineBytes ?? 64 * 1024
  const maxRetainedBytes = options.maxRetainedBytes ?? 8 * 1024 * 1024
  const maxFiles = options.maxFiles ?? 8192
  for (const value of [maxLines, maxMatches, maxScanBytes, maxLineBytes, maxRetainedBytes, maxFiles]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid access log reader budget')
  }
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0 || maxDurationMs > 30_000) throw new Error('Invalid access log reader duration')
  if (maxLineBytes > 64 * 1024 || maxRetainedBytes > 8 * 1024 * 1024 || maxFiles > 8192 || maxMatches > 20_000 || maxScanBytes > 1024 * 1024 * 1024) throw new Error('Invalid access log reader budget')

  function budget(signal?: AbortSignal) {
    const started = clock(), controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), maxDurationMs)
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, {once: true}); if (signal?.aborted) abort()
    return {controller, bytes: 0, scanned: 0, oversized: false,
      check() {if (controller.signal.aborted || clock() - started >= maxDurationMs) throw new ScanUnavailable('Access log scan deadline/abort exceeded')},
      dispose() {clearTimeout(timer); signal?.removeEventListener('abort', abort)}}
  }
  type Budget = ReturnType<typeof budget>

  async function stat(path: string) {
    try { return await fs.lstat(path) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  async function listFiles(directory: string, b?: Budget): Promise<DayFile[]> {
    if (!(await stat(directory))?.isDirectory()) return [] // Includes directory symlinks.
    const files: DayFile[] = []
    const entries = fs.opendir ? await fs.opendir(directory) : await fs.readdir(directory, {withFileTypes: true})
    let seen = 0
    for await (const entry of entries) {
      b?.check()
      if (++seen > maxFiles) throw new ScanUnavailable('Access log directory entry budget exceeded')
      const match = FILE_PATTERN.exec(entry.name)
      if (!entry.isFile() || !match || !validDay(match[1]!)) continue
      const info = await stat(resolve(directory, entry.name))
      if (info?.isFile()) files.push({ name: entry.name, day: match[1]!, gzip: !!match[2], stat: info })
    }
    return files.sort((a, b) => a.day.localeCompare(b.day))
  }

  function selectFiles(files: DayFile[]): DayFile[] {
    // During compression/recovery both names can exist. The plain source is
    // authoritative until maintenance verifies/publishes gzip and removes it.
    const plainDays = new Set(files.filter(file => !file.gzip).map(file => file.day))
    return files.filter(file => !file.gzip || !plainDays.has(file.day))
  }

  async function openRegular(path: string) {
    const before = await stat(path)
    if (!before?.isFile()) return undefined
    const handle = await fs.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
    try {
      const after = await handle.stat()
      if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) {
        throw new Error('Access log file changed while opening')
      }
      return handle
    } catch (error) {
      await handle.close()
      throw error
    }
  }

  async function* lines(directory: string, file: DayFile, b: Budget): AsyncGenerator<string> {
    let handle: Awaited<ReturnType<typeof openRegular>>
    try { handle = await openRegular(resolve(directory, file.name)) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (!handle) {
      // A retention/compression pass may have replaced the plain name after listing.
      if (!file.gzip) {
        const name = `${file.name}.gz`, info = await stat(resolve(directory, name))
        if (info?.isFile()) {yield* lines(directory, {...file, name, gzip: true, stat: info}, b); return}
      }
      throw new ScanUnavailable('Access source changed during scan')
    }
    try {
      if (!file.stat.size) return
      const source = handle.createReadStream({ autoClose: false, end: file.stat.size - 1, signal: b.controller.signal })
      const decoder = file.gzip ? createGunzip() : undefined
      const input = decoder ?? source
      const forwardError = (error: Error) => { input.destroy(error) }
      if (decoder) source.on('error', forwardError)
      try {
        const iterator = input[Symbol.asyncIterator]()
        if (decoder) source.pipe(decoder)
        const retained = Buffer.allocUnsafe(maxLineBytes)
        let length = 0, oversized = false, pending = false
        for await (const data of {[Symbol.asyncIterator]: () => iterator}) {
          const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data)
          b.check(); b.bytes += chunk.length
          if (b.bytes > maxScanBytes) throw new ScanUnavailable('Access log scan byte budget exceeded')
          let offset = 0
          while (offset < chunk.length) {
            b.check()
            const newline = chunk.indexOf(10, offset), end = newline < 0 ? chunk.length : newline
            const size = end - offset
            pending ||= size > 0
            if (length + size + 1 > maxLineBytes) {oversized = true; b.oversized = true}
            if (!oversized) {chunk.copy(retained, length, offset, end); length += size}
            if (newline < 0) break
            if (++b.scanned > maxLines) throw new ScanUnavailable('Access log scan line budget exceeded')
            yield oversized ? '' : retained.subarray(0, length).toString('utf8').replace(/\r$/, '')
            length = 0; oversized = false; pending = false; offset = newline + 1
          }
        }
        if (pending) {
          if (++b.scanned > maxLines) throw new ScanUnavailable('Access log scan line budget exceeded')
          yield oversized ? '' : retained.subarray(0, length).toString('utf8').replace(/\r$/, '')
        }
      } finally {source.destroy(); decoder?.destroy()}
    } finally { await handle.close() }
  }

  let lastScan = {scannedBytes: 0, scannedLines: 0, retainedBytes: 0, retainedRows: 0}
  async function queryAccessLogs(q: AccessQuery): Promise<ListLogsResult & { truncated: boolean }> {
    const current = now().getTime()
    const from = (q.from ?? new Date(current - 7 * DAY_MS)).getTime()
    const to = (q.to ?? new Date(current)).getTime()
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('Invalid access log date range')
    if (!Number.isSafeInteger(q.limit) || q.limit < 1 || !Number.isSafeInteger(q.offset) || q.offset < 0
      || q.limit > 10_000 || q.offset > 10_000 || (q.sort !== 'newest' && q.sort !== 'oldest')) throw createError({statusCode: 400, message: 'Invalid access log pagination'})
    const rows: AccessLogRow[] = []
    let total = 0
    let skipped = 0
    let scanned = 0
    let truncated = false
    let retainedBytes = 0, highBytes = 0, highRows = 0
    const b = budget(q.signal)
    const started = clock()
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), maxDurationMs)
    const expired = () => abort.signal.aborted || clock() - started >= maxDurationMs
    const directory = dir()
    const method = q.method?.trim().toUpperCase()
    const search = q.search?.toLowerCase()
    const matches = (row: AccessLogRow) => {
      const time = Date.parse(row.timestamp)
      return time >= from && time <= to
        && (!q.path || row.path === q.path)
        && (!method || row.method === method)
        && (q.status === undefined || row.status_code === q.status)
        && (q.min_status === undefined || row.status_code >= q.min_status)
        && (q.max_status === undefined || row.status_code <= q.max_status)
        && (!search || row.path.toLowerCase().includes(search) || row.user_agent?.toLowerCase().includes(search))
    }
    const collect = (row: AccessLogRow) => {
      if (skipped < q.offset) skipped++
      else if (rows.length < q.limit) {
        const bytes = Buffer.byteLength(JSON.stringify(row))
        if (retainedBytes + bytes > maxRetainedBytes) {truncated = true; return true}
        rows.push(row); retainedBytes += bytes
        highBytes = Math.max(highBytes, retainedBytes); highRows = Math.max(highRows, rows.length)
      }
      return !q.includeTotal && rows.length === q.limit
    }
    try {
      if (from <= to) {
        const fromDay = new Date(from).toISOString().slice(0, 10)
        const toDay = new Date(to).toISOString().slice(0, 10)
        const files = selectFiles(await listFiles(directory, b)).filter(file => file.day >= fromDay && file.day <= toDay)
        if (q.sort === 'newest') files.reverse()
        outer: for (const file of files) {
          if (expired()) { truncated = true; break }
          const dayRows: Array<{row: AccessLogRow, bytes: number} | undefined> = []
          const window = Math.min(q.offset + q.limit, maxMatches)
          let head = 0, size = 0, dayBytes = 0, dayComplete = true
          if (window < q.offset + q.limit) truncated = true
          try {
            for await (const line of lines(directory, file, b)) {
              if (expired()) { truncated = true; dayComplete = false; break }
              scanned++
              const row = parseAccessLogLine(line, file.day)
              if (!row || !matches(row)) continue
              total++
              if (q.sort === 'oldest') {
                if (collect(row)) break outer
              } else {
                const bytes = Buffer.byteLength(JSON.stringify(row))
                while (size && (size >= window || retainedBytes + dayBytes + bytes > maxRetainedBytes)) {
                  if (size < window) truncated = true
                  dayBytes -= dayRows[head]!.bytes; dayRows[head] = undefined
                  head = (head + 1) % window; size--
                }
                if (retainedBytes + dayBytes + bytes > maxRetainedBytes) {truncated = true; continue}
                dayRows[(head + size) % window] = {row, bytes}; size++; dayBytes += bytes
                highBytes = Math.max(highBytes, retainedBytes + dayBytes); highRows = Math.max(highRows, rows.length + size)
              }
            }
          } catch (error) {
            if (!(error instanceof ScanUnavailable) && !b.controller.signal.aborted && !abort.signal.aborted) throw error
            // An ascending prefix is NOT a newest page for this day.
            truncated = true; dayComplete = false
          }
          if (q.sort === 'newest' && dayComplete) {
            for (let index = size - 1; index >= 0; index--) {
              if (collect(dayRows[(head + index) % window]!.row)) break outer
            }
          }
          if (!dayComplete) break
          if (scanned >= maxLines || expired()) { truncated = true; break }
        }
      }
    } catch (error) {
      if (!(error instanceof ScanUnavailable) && !b.controller.signal.aborted && !abort.signal.aborted) throw error
      truncated = true
    } finally { clearTimeout(timer); b.dispose(); lastScan = {scannedBytes: b.bytes, scannedLines: b.scanned, retainedBytes: highBytes, retainedRows: highRows} }
    truncated ||= b.oversized
    return { rows, total: q.includeTotal ? total : rows.length, limit: q.limit, offset: q.offset, sort: q.sort, truncated }
  }

  async function readAccessLogById(id: string, signal?: AbortSignal): Promise<AccessLogRow | null> {
    const match = /^(\d{4}-\d{2}-\d{2}):(.+)$/.exec(id)
    if (id.length > 512 || !match || !validDay(match[1]!)) return null // Legacy DB IDs cannot address files.
    const directory = dir()
    const b = budget(signal)
    try {
      const file = selectFiles(await listFiles(directory, b)).find(file => file.day === match[1])
      if (file) for await (const line of lines(directory, file, b)) {
        const row = parseAccessLogLine(line, file.day)
        if (row?.id === id) return row
      }
      if (b.oversized) throw new ScanUnavailable('Access detail unavailable: oversized legacy records')
      return null
    } catch (error) {
      if (b.controller.signal.aborted) throw new ScanUnavailable('Access detail scan aborted')
      throw error
    } finally {b.dispose()}
  }

  async function accessHourly(hours = 24, current = now(), signal?: AbortSignal): Promise<AccessHourlyBucket[]> {
    if (!Number.isSafeInteger(hours) || hours < 1 || hours > 168 || !Number.isFinite(current.getTime())) {
      throw new Error('Access log hourly range must be positive integer hours with a valid date')
    }
    // Include the current (partial) UTC hour, zero-fill every preceding bucket.
    const end = current.getTime()
    const start = Math.floor(end / HOUR_MS) * HOUR_MS - (hours - 1) * HOUR_MS
    const buckets = Array.from({ length: hours }, (_, index) => ({ hour: new Date(start + index * HOUR_MS).toISOString(), count: 0, errors: 0 }))
    const directory = dir()
    const firstDay = new Date(start).toISOString().slice(0, 10)
    const lastDay = current.toISOString().slice(0, 10)
    const b = budget(signal)
    try {
    for (const file of selectFiles(await listFiles(directory, b))) {
      if (file.day < firstDay || file.day > lastDay) continue
      for await (const line of lines(directory, file, b)) {
        const row = parseAccessLogLine(line, file.day)
        if (!row) continue
        const time = Date.parse(row.timestamp)
        if (time < start || time > end) continue
        const bucket = buckets[Math.floor((time - start) / HOUR_MS)]!
        bucket.count++
        if (row.status_code >= 500) bucket.errors++
      }
    }
    if (b.oversized) throw new ScanUnavailable('Access hourly unavailable: oversized legacy records')
    return buckets
    } catch (error) {
      if (b.controller.signal.aborted) throw new ScanUnavailable('Access hourly scan aborted')
      throw error
    } finally {b.dispose()}
  }

  async function readCache(directory: string): Promise<CountCache> {
    try {
      const handle = await openRegular(resolve(directory, '.index.json'))
      if (!handle) return {}
      try {
        if ((await handle.stat()).size > 4 * 1024 * 1024) return {}
        const value: unknown = JSON.parse(await handle.readFile('utf8'))
        return value && typeof value === 'object' && !Array.isArray(value) ? value as CountCache : {}
      } finally { await handle.close() }
    } catch { return {} } // Disposable cache; never a source of truth.
  }

  async function writeCache(directory: string, cache: CountCache) {
    const destination = resolve(directory, '.index.json')
    const temporary = resolve(directory, `.index.${randomUUID()}.tmp`)
    let created = false
    try {
      const encoded = JSON.stringify(cache)
      if (Buffer.byteLength(encoded) > 4 * 1024 * 1024) return
      const existing = await stat(destination)
      if (existing && !existing.isFile()) return
      const handle = await fs.open(temporary, 'wx', 0o600)
      created = true
      try { await handle.writeFile(encoded); await handle.sync() } finally { await handle.close() }
      const latest = await stat(destination)
      if (latest && !latest.isFile()) return
      await fs.rename(temporary, destination)
    } catch { /* Read-only directories and concurrent cache writes are harmless. */ }
    finally { if (created) { try { await fs.unlink(temporary) } catch { /* Renamed or removed already. */ } } }
  }

  async function tailHash(handle: Awaited<ReturnType<typeof fs.open>>, offset: number) {
    const buffer = Buffer.alloc(Math.min(64, offset))
    if (buffer.length) await handle.read(buffer, 0, buffer.length, offset - buffer.length)
    return createHash('sha256').update(buffer).digest('hex')
  }
  function validSaved(saved: CountCacheEntry | undefined, file: DayFile): saved is CountCacheEntry {
    return !!saved && saved.version === 2 && saved.dev === file.stat.dev && saved.ino === file.stat.ino
      && saved.birthtimeMs === file.stat.birthtimeMs && Number.isSafeInteger(saved.lines) && saved.lines >= 0
      && Number.isSafeInteger(saved.offset) && saved.offset >= 0 && saved.offset <= file.stat.size
      && Number.isSafeInteger(saved.newlines) && saved.newlines >= 0 && typeof saved.pending === 'boolean'
      && typeof saved.tail === 'string' && saved.tail.length === 64
  }
  async function accessStats(signal?: AbortSignal): Promise<AccessFileStats> {
    const directory = dir(), b = budget(signal)
    const updated: CountCache = {}
    try {
      // Do not read/write cache through a directory symlink either.
      if (!(await stat(directory))?.isDirectory()) return {count: 0, oldest: null, newest: null, bytes: 0, files: 0}
      const physicalFiles = await listFiles(directory, b), files = selectFiles(physicalFiles), cache = await readCache(directory)
      let count = 0
      for (const file of files) {
        b.check()
        const saved = cache[file.name], path = resolve(directory, file.name)
        let entry: CountCacheEntry | undefined
        if (file.gzip) {
          if (validSaved(saved, file) && saved.size === file.stat.size && saved.mtimeMs === file.stat.mtimeMs) entry = saved
          else {
            let lineCount = 0
            for await (const _line of lines(directory, file, b)) lineCount++
            const after = await stat(path)
            if (after?.isFile() && after.size === file.stat.size && after.mtimeMs === file.stat.mtimeMs && after.ino === file.stat.ino && after.dev === file.stat.dev) {
              entry = {version: 2, size: after.size, mtimeMs: after.mtimeMs, lines: lineCount, dev: after.dev, ino: after.ino, birthtimeMs: after.birthtimeMs, offset: after.size, newlines: lineCount, pending: false, tail: '0'.repeat(64)}
            }
          }
        } else {
          const handle = await openRegular(path)
          if (!handle) throw new ScanUnavailable('Access stats source changed')
          try {
            const resumable = validSaved(saved, file) && (saved.size < file.stat.size || saved.mtimeMs === file.stat.mtimeMs)
              && saved.tail === await tailHash(handle, saved.offset)
            let offset = resumable ? saved.offset : 0, newlines = resumable ? saved.newlines : 0, pending = resumable ? saved.pending : false
            const stream = offset < file.stat.size ? handle.createReadStream({autoClose: false, start: offset, end: file.stat.size - 1, signal: b.controller.signal, highWaterMark: Math.min(64 * 1024, maxScanBytes)}) : undefined
            try {
              if (stream) for await (const data of stream) {
                b.check()
                const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data)
                if (b.bytes + chunk.length > maxScanBytes) throw new ScanUnavailable('Access stats byte budget exceeded')
                b.bytes += chunk.length; offset += chunk.length
                for (const byte of chunk) if (byte === 10) {newlines++; b.scanned++}
                pending = chunk[chunk.length - 1] !== 10
                if (b.scanned > maxLines) throw new ScanUnavailable('Access stats line budget exceeded')
              }
            } finally {
              const after = await stat(path)
              if (handle.fd !== -1 && after?.isFile() && after.dev === file.stat.dev && after.ino === file.stat.ino && after.size >= offset
                && (after.size > file.stat.size || after.mtimeMs === file.stat.mtimeMs)) {
                // Persist a bounded suffix checkpoint even on budget exhaustion.
                entry = {version: 2, size: file.stat.size, mtimeMs: file.stat.mtimeMs, lines: newlines + Number(pending), dev: file.stat.dev, ino: file.stat.ino, birthtimeMs: file.stat.birthtimeMs, offset, newlines, pending, tail: await tailHash(handle, offset)}
                updated[file.name] = entry
              }
              stream?.destroy()
            }
          } finally {await handle.close()}
        }
        if (!entry || entry.offset !== file.stat.size) throw new ScanUnavailable('Access stats source changed/incomplete')
        updated[file.name] = entry; count += entry.lines
      }
      await writeCache(directory, updated)
      return {count, oldest: files.length ? `${files[0]!.day}T00:00:00.000Z` : null,
        newest: files.length ? `${files[files.length - 1]!.day}T00:00:00.000Z` : null,
        bytes: physicalFiles.reduce((sum, file) => sum + file.stat.size, 0), files: physicalFiles.length}
    } catch (error) {
      await writeCache(directory, updated)
      if (b.controller.signal.aborted) throw new ScanUnavailable('Access stats scan aborted')
      throw error
    } finally {b.dispose()}
  }

  let statsFlight: {directory: string, promise: Promise<AccessFileStats>} | undefined
  return {
    diagnostics: () => ({...scans.diagnostics(), lastScan: {...lastScan}}),
    queryAccessLogs: (q: AccessQuery) => scans.run(() => queryAccessLogs(q), q.signal),
    readAccessLogById: (id: string, signal?: AbortSignal) => scans.run(() => readAccessLogById(id, signal), signal),
    accessHourly: (hours = 24, current = now(), signal?: AbortSignal) => scans.run(() => accessHourly(hours, current, signal), signal),
    accessStats: (signal?: AbortSignal) => {
      const directory = dir()
      if (!signal && statsFlight?.directory === directory) return statsFlight.promise
      const promise = scans.run(() => accessStats(signal), signal).finally(() => {if (statsFlight?.promise === promise) statsFlight = undefined})
      if (!signal) statsFlight = {directory, promise}
      return promise
    }
  }
}

const reader = createAccessLogReader()
export const queryAccessLogs = reader.queryAccessLogs
export const readAccessLogById = reader.readAccessLogById
export const accessHourly = reader.accessHourly
export const accessStats = reader.accessStats
