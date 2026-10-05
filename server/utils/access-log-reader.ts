import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { accessLogDir } from './access-log-store'
import type { ListLogsResult } from './logging-admin'
import type { AccessHourlyBucket } from '~/types/logging'

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

type ReaderFs = Pick<typeof nodeFs, 'lstat' | 'readdir' | 'open' | 'rename' | 'unlink'>
interface ReaderOptions {
  dir?: () => string
  now?: () => Date
  fs?: ReaderFs
  /** Monotonic clock and lower budgets allow deterministic tests without huge fixtures. */
  clock?: () => number
  maxLines?: number
  maxDurationMs?: number
  maxMatchesPerFile?: number
}
interface DayFile { name: string; day: string; gzip: boolean; stat: Stats }
interface CountCacheEntry { size: number; mtimeMs: number; lines: number }
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
  const maxMatches = options.maxMatchesPerFile ?? 200_000
  for (const value of [maxLines, maxMatches]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid access log reader budget')
  }
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0) throw new Error('Invalid access log reader duration')

  async function stat(path: string) {
    try { return await fs.lstat(path) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  async function listFiles(directory: string): Promise<DayFile[]> {
    if (!(await stat(directory))?.isDirectory()) return [] // Includes directory symlinks.
    const files: DayFile[] = []
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
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

  async function* lines(directory: string, file: DayFile, signal?: AbortSignal): AsyncGenerator<string> {
    let handle: Awaited<ReturnType<typeof openRegular>>
    try { handle = await openRegular(resolve(directory, file.name)) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (!handle) {
      // A retention/compression pass may have replaced the plain name after listing.
      if (!file.gzip) yield* lines(directory, { ...file, name: `${file.name}.gz`, gzip: true }, signal)
      return
    }
    try {
      const source = handle.createReadStream({ autoClose: false, signal })
      const decoder = file.gzip ? createGunzip() : undefined
      const input = decoder ?? source
      const forwardError = (error: Error) => { input.destroy(error) }
      if (decoder) source.on('error', forwardError)
      const reader = createInterface({ input, crlfDelay: Infinity })
      try {
        // Attach the iterator's error handler before starting decompression.
        const iterator = reader[Symbol.asyncIterator]()
        if (decoder) source.pipe(decoder)
        for await (const line of { [Symbol.asyncIterator]: () => iterator }) yield line
      } finally {
        reader.close()
        source.destroy()
        decoder?.destroy()
      }
    } finally { await handle.close() }
  }

  async function queryAccessLogs(q: AccessQuery): Promise<ListLogsResult & { truncated: boolean }> {
    const current = now().getTime()
    const from = (q.from ?? new Date(current - 7 * DAY_MS)).getTime()
    const to = (q.to ?? new Date(current)).getTime()
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('Invalid access log date range')
    if (!Number.isSafeInteger(q.limit) || q.limit < 1 || !Number.isSafeInteger(q.offset) || q.offset < 0
      || (q.sort !== 'newest' && q.sort !== 'oldest')) throw new Error('Invalid access log pagination')
    const rows: AccessLogRow[] = []
    let total = 0
    let skipped = 0
    let scanned = 0
    let truncated = false
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
      else if (rows.length < q.limit) rows.push(row)
      return !q.includeTotal && rows.length === q.limit
    }
    try {
      if (from <= to) {
        const fromDay = new Date(from).toISOString().slice(0, 10)
        const toDay = new Date(to).toISOString().slice(0, 10)
        const files = selectFiles(await listFiles(directory)).filter(file => file.day >= fromDay && file.day <= toDay)
        if (q.sort === 'newest') files.reverse()
        outer: for (const file of files) {
          if (expired()) { truncated = true; break }
          const dayRows: AccessLogRow[] = []
          let dayMatches = 0
          try {
            for await (const line of lines(directory, file, abort.signal)) {
              if (scanned >= maxLines || expired()) { truncated = true; break }
              scanned++
              const row = parseAccessLogLine(line, file.day)
              if (!row || !matches(row)) continue
              total++
              if (q.sort === 'oldest') {
                if (collect(row)) break outer
              } else {
                // Ring buffer retains the newest matches rather than the first
                // 200K (oldest) matches when a busy day exceeds the memory cap.
                dayRows[dayMatches % maxMatches] = row
                dayMatches++
                if (dayMatches > maxMatches) truncated = true
              }
            }
          } catch (error) {
            if (!abort.signal.aborted || (error as Error).name !== 'AbortError') throw error
            // Keep the already scanned part of this day on a real I/O deadline.
            truncated = true
          }
          if (q.sort === 'newest') {
            for (let index = dayMatches - 1; index >= Math.max(0, dayMatches - maxMatches); index--) {
              if (collect(dayRows[index % maxMatches]!)) break outer
            }
          }
          if (scanned >= maxLines || expired()) { truncated = true; break }
        }
      }
    } catch (error) {
      if (!abort.signal.aborted || (error as Error).name !== 'AbortError') throw error
      truncated = true
    } finally { clearTimeout(timer) }
    return { rows, total: q.includeTotal ? total : rows.length, limit: q.limit, offset: q.offset, sort: q.sort, truncated }
  }

  async function readAccessLogById(id: string): Promise<AccessLogRow | null> {
    const match = /^(\d{4}-\d{2}-\d{2}):(.+)$/.exec(id)
    if (!match || !validDay(match[1]!)) return null // Legacy DB IDs cannot address files.
    const directory = dir()
    const file = selectFiles(await listFiles(directory)).find(file => file.day === match[1])
    if (file) {
      for await (const line of lines(directory, file)) {
        const row = parseAccessLogLine(line, file.day)
        if (row?.id === id) return row
      }
    }
    return null
  }

  async function accessHourly(hours = 24, current = now()): Promise<AccessHourlyBucket[]> {
    if (!Number.isSafeInteger(hours) || hours < 1 || !Number.isFinite(current.getTime())) {
      throw new Error('Access log hourly range must be positive integer hours with a valid date')
    }
    // Include the current (partial) UTC hour, zero-fill every preceding bucket.
    const end = current.getTime()
    const start = Math.floor(end / HOUR_MS) * HOUR_MS - (hours - 1) * HOUR_MS
    const buckets = Array.from({ length: hours }, (_, index) => ({ hour: new Date(start + index * HOUR_MS).toISOString(), count: 0, errors: 0 }))
    const directory = dir()
    const firstDay = new Date(start).toISOString().slice(0, 10)
    const lastDay = current.toISOString().slice(0, 10)
    for (const file of selectFiles(await listFiles(directory))) {
      if (file.day < firstDay || file.day > lastDay) continue
      for await (const line of lines(directory, file)) {
        const row = parseAccessLogLine(line, file.day)
        if (!row) continue
        const time = Date.parse(row.timestamp)
        if (time < start || time > end) continue
        const bucket = buckets[Math.floor((time - start) / HOUR_MS)]!
        bucket.count++
        if (row.status_code >= 500) bucket.errors++
      }
    }
    return buckets
  }

  async function readCache(directory: string): Promise<CountCache> {
    try {
      const handle = await openRegular(resolve(directory, '.index.json'))
      if (!handle) return {}
      try {
        if ((await handle.stat()).size > 1024 * 1024) return {}
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
      const existing = await stat(destination)
      if (existing && !existing.isFile()) return
      const handle = await fs.open(temporary, 'wx', 0o600)
      created = true
      try { await handle.writeFile(JSON.stringify(cache)); await handle.sync() } finally { await handle.close() }
      const latest = await stat(destination)
      if (latest && !latest.isFile()) return
      await fs.rename(temporary, destination)
    } catch { /* Read-only directories and concurrent cache writes are harmless. */ }
    finally { if (created) { try { await fs.unlink(temporary) } catch { /* Renamed or removed already. */ } } }
  }

  async function accessStats(): Promise<AccessFileStats> {
    const directory = dir()
    // Do not read/write the cache through a directory symlink either.
    if (!(await stat(directory))?.isDirectory()) return { count: 0, oldest: null, newest: null, bytes: 0, files: 0 }
    const physicalFiles = await listFiles(directory)
    const files = selectFiles(physicalFiles)
    const cache = await readCache(directory)
    const updated: CountCache = {}
    let count = 0
    const today = now().toISOString().slice(0, 10)
    for (const file of files) {
      const saved = cache[file.name]
      const cacheable = file.gzip && file.day < today
      let lineCount = 0
      if (cacheable && saved && saved.size === file.stat.size && saved.mtimeMs === file.stat.mtimeMs
        && Number.isSafeInteger(saved.lines) && saved.lines >= 0) lineCount = saved.lines
      else for await (const _line of lines(directory, file)) lineCount++
      count += lineCount
      // Don't cache counts for a file replaced/changed during the scan.
      if (cacheable) {
        const after = await stat(resolve(directory, file.name))
        if (after?.isFile() && after.size === file.stat.size && after.mtimeMs === file.stat.mtimeMs
          && after.ino === file.stat.ino && after.dev === file.stat.dev) {
          updated[file.name] = { size: after.size, mtimeMs: after.mtimeMs, lines: lineCount }
        }
      }
    }
    if (files.length || Object.keys(cache).length) await writeCache(directory, updated)
    return {
      count,
      oldest: files.length ? `${files[0]!.day}T00:00:00.000Z` : null,
      newest: files.length ? `${files[files.length - 1]!.day}T00:00:00.000Z` : null,
      bytes: physicalFiles.reduce((sum, file) => sum + file.stat.size, 0),
      files: physicalFiles.length
    }
  }

  return { queryAccessLogs, readAccessLogById, accessHourly, accessStats }
}

const reader = createAccessLogReader()
export const queryAccessLogs = reader.queryAccessLogs
export const readAccessLogById = reader.readAccessLogById
export const accessHourly = reader.accessHourly
export const accessStats = reader.accessStats
