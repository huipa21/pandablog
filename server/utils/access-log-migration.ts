import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { accessLogDir, fileNameForDate, maintainAccessLogFiles, serializeAccessLog, withAccessLogMutation } from './access-log-store'
import { queryDb } from './db'
import { redactDeep } from './logging-logic'
import { sanitizeLogContext, writeConsoleEntry } from './log-console'
import { firstRow, queryRows, stringifyRecordId } from './surrealResult'
import type { AccessLogEntry, LoggingSettings } from '~/types/logging'

export const ACCESS_MIGRATION_KEY = '__access_logs_to_files_v1'
export const ACCESS_EXPORTED_KEY = '__access_logs_exported_v1'
export const ACCESS_REMOVED_KEY = '__access_logs_table_removed_v1'
const RECEIPT = '.migration-v1.json'
const PAGE_SIZE = 5000

type Db = Parameters<typeof queryDb>[0]
export interface AccessCursor { timestamp: string; id: string; numericId?: string }
interface Checkpoint {
  dir: string
  cutoff: string
  cursor?: AccessCursor
  total: number
  days: string[]
  counts: Record<string, number>
}
interface Receipt { token: string; dir: string; days: string[]; counts: Record<string, number> }
export interface AccessMigrationOptions {
  dir: string
  legacyDir: string
  now: Date
  settings: Pick<LoggingSettings, 'retention_access_days' | 'redact_fields' | 'max_metadata_size_kb'>
  getMarker: (key: string) => Promise<unknown>
  setMarker: (key: string, value: unknown) => Promise<void>
  tableExists: () => Promise<boolean>
  loadPage: (cutoff: string, cursor?: AccessCursor) => Promise<Record<string, unknown>[]>
  exclusive: <T>(work: (directory: string) => Promise<T>) => Promise<T>
  maintain: () => Promise<unknown>
  progress?: (total: number) => void
}

/** No invalid timestamps/rows are silently dropped: preserve sources and withhold completion. */
export function migrationEntry(row: Record<string, unknown>, settings: AccessMigrationOptions['settings']): AccessLogEntry {
  const timestamp = row.timestamp instanceof Date ? row.timestamp : new Date(String(row.timestamp ?? ''))
  if (!Number.isFinite(timestamp.getTime()) || typeof row.method !== 'string' || typeof row.path !== 'string'
    || !Number.isInteger(row.status_code) || !Number.isInteger(row.response_time_ms)) {
    throw new Error('Invalid legacy access log row; migration halted without removing source')
  }
  // Stable fallback IDs are essential when the cursor/marker write fails after publication.
  const identity = row.id === undefined ? JSON.stringify(row) : stringifyRecordId(row.id)
  const safe = redactDeep(row, settings.redact_fields) as Record<string, unknown>
  const requestId = typeof safe.request_id === 'string' && safe.request_id
    && !settings.redact_fields.some(field => field.toLowerCase() === 'request_id') ? safe.request_id
    : `legacy-${createHash('sha256').update(identity).digest('hex')}`
  return {
    timestamp: timestamp.toISOString(), request_id: requestId,
    method: String(safe.method), path: String(safe.path),
    status_code: row.status_code as number, response_time_ms: row.response_time_ms as number,
    ip: typeof safe.ip === 'string' ? safe.ip : undefined,
    user_agent: typeof safe.user_agent === 'string' ? safe.user_agent : undefined,
    referrer: typeof safe.referrer === 'string' ? safe.referrer : undefined,
    query_params: safe.query_params && typeof safe.query_params === 'object' && !Array.isArray(safe.query_params)
      ? sanitizeLogContext(safe.query_params, settings) as Record<string, unknown> : undefined
  }
}

export function migrationCursor(row: Record<string, unknown>): AccessCursor {
  const rawTimestamp = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp)
  const timestamp = new Date(rawTimestamp)
  const id = stringifyRecordId(row.id)
  if (!Number.isFinite(timestamp.getTime()) || !id.startsWith('access_logs:')) throw new Error('Invalid access migration cursor')
  const value = row.id && typeof row.id === 'object' ? (row.id as { id?: unknown }).id : undefined
  if (value !== undefined && !['string', 'number', 'bigint'].includes(typeof value)) {
    throw new Error('Unsupported compound access migration record ID; source retained')
  }
  return {
    // SurrealDB timestamps have nanoseconds. Never round a keyset cursor down to JS milliseconds.
    timestamp: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{4,9}Z$/.test(rawTimestamp) ? rawTimestamp : timestamp.toISOString(), id,
    ...(typeof value === 'number' || typeof value === 'bigint' ? { numericId: String(value) } : {})
  }
}

async function stat(path: string) {
  try { return await lstat(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
async function regular(path: string) {
  const before = await lstat(path)
  if (!before.isFile()) throw new Error('Access migration requires regular files (no symlinks)')
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  const after = await file.stat()
  if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) {
    await file.close()
    throw new Error('Access migration source changed while opening')
  }
  return file
}
async function assertUnchanged(path: string, original: Stats) {
  const current = await lstat(path)
  if (!current.isFile() || current.size !== original.size || current.mtimeMs !== original.mtimeMs
    || current.ino !== original.ino || current.dev !== original.dev) throw new Error('Access migration source changed; source retained')
}
async function directory(path: string) {
  await mkdir(path, { recursive: true })
  if (!(await lstat(path)).isDirectory()) throw new Error('Access migration directory must not be a symlink')
}
async function syncDirectory(path: string) {
  // Windows does not support directory fsync; file fsync and atomic rename still apply.
  if (process.platform === 'win32') return
  const file = await open(path, constants.O_RDONLY)
  try { await file.sync() } finally { await file.close() }
}
async function* lines(path: string, gzip = false): AsyncGenerator<string> {
  const file = await regular(path)
  const stream = file.createReadStream({ autoClose: false })
  const input = gzip ? stream.pipe(createGunzip()) : stream
  if (gzip) stream.on('error', error => input.destroy(error))
  const reader = createInterface({ input, crlfDelay: Infinity })
  try { for await (const line of reader) yield line } finally {
    reader.close()
    input.destroy()
    stream.destroy()
    await file.close()
  }
}

/** Bounded-page, streamed chronological merge. Replaying a published page replaces, not duplicates, its IDs. */
export async function mergeMigrationDay(directoryPath: string, entries: AccessLogEntry[]) {
  if (!entries.length) return 0
  await directory(directoryPath)
  const name = fileNameForDate(new Date(entries[0]!.timestamp!))
  if (entries.some(entry => fileNameForDate(new Date(entry.timestamp!)) !== name)) throw new Error('Mixed migration day')
  const path = resolve(directoryPath, name)
  const archive = `${path}.gz`
  const temp = `${path}.migrating`
  const plainStat = await stat(path)
  const archiveStat = await stat(archive)
  const tempStat = await stat(temp)
  if ([plainStat, archiveStat, tempStat].some(value => value && !value.isFile())) {
    throw new Error('Unsafe access migration destination')
  }
  // A temp is never authoritative; page cursor advances only after atomic publication.
  if (tempStat) await unlink(temp)
  const output = await open(temp, 'wx', 0o600)
  const unique = new Map(entries.map(entry => [entry.request_id!, entry]))
  const rows = [...unique.values()].sort((a, b) => a.timestamp!.localeCompare(b.timestamp!) || a.request_id!.localeCompare(b.request_id!))
  let next = 0
  let published = false
  let buffer = ''
  let count = 0
  const flush = async () => {
    if (buffer) { await output.writeFile(buffer); buffer = '' }
  }
  const write = async (line: string) => {
    count += 1
    buffer += `${line}\n`
    if (buffer.length >= 64 * 1024) await flush()
  }
  try {
    const source = plainStat ? path : archiveStat ? archive : undefined
    if (source) {
      for await (const line of lines(source, !plainStat)) {
        let existing: { id?: string; ts?: string } = {}
        try { existing = JSON.parse(line) } catch { /* Preserve malformed live lines verbatim. */ }
        if (unique.has(existing?.id ?? '')) continue
        while (next < rows.length && typeof existing?.ts === 'string' && rows[next]!.timestamp! <= existing.ts) {
          await write(serializeAccessLog(rows[next++]!))
        }
        await write(line)
      }
    }
    while (next < rows.length) await write(serializeAccessLog(rows[next++]!))
    await flush()
    await output.sync()
    await output.close()
    if (plainStat) await assertUnchanged(path, plainStat)
    else {
      if (await stat(path)) throw new Error('Access migration live file appeared; source retained')
      if (archiveStat) await assertUnchanged(archive, archiveStat)
    }
    await rename(temp, path)
    published = true
    await syncDirectory(directoryPath)
    // Plain is now authoritative, including a crash before archive unlink.
    if (archiveStat) { await unlink(archive); await syncDirectory(directoryPath) }
    return count
  } finally {
    await output.close()
    if (!published && await stat(temp)) await unlink(temp)
  }
}

async function publishReceipt(dir: string, receipt: Receipt) {
  await directory(dir)
  const path = resolve(dir, RECEIPT)
  const existing = await stat(path)
  if (existing && !existing.isFile()) throw new Error('Unsafe migration receipt')
  const temp = `${path}.${randomUUID()}.tmp`
  const file = await open(temp, 'wx', 0o600)
  try {
    await file.writeFile(JSON.stringify(receipt))
    await file.sync()
    await file.close()
    await rename(temp, path)
    await syncDirectory(dir)
  } finally {
    await file.close()
    if (await stat(temp)) await unlink(temp)
  }
}

async function verifyDayCounts(dir: string, days: string[], counts: Record<string, number>) {
  if (days.length && !(await stat(dir))?.isDirectory()) throw new Error('Access migration storage missing or unsafe')
  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isSafeInteger(counts[day]) || counts[day]! < 1) {
      throw new Error('Invalid migration receipt day/count')
    }
    const path = resolve(dir, `access-${day}.ndjson`)
    const plain = await stat(path)
    const archive = await stat(`${path}.gz`)
    if ((plain && !plain.isFile()) || (archive && !archive.isFile())) throw new Error('Unsafe exported access day')
    if (!plain?.isFile() && !archive?.isFile()) throw new Error('Exported access day missing; refusing table removal')
    let count = 0
    for await (const _line of lines(plain?.isFile() ? path : `${path}.gz`, !plain?.isFile())) count += 1
    if (count < counts[day]!) throw new Error('Exported access day truncated; refusing table removal')
  }
}

export async function verifyAccessMigrationReceipt(value: unknown, dir: string) {
  const receipt = value as Receipt | undefined
  if (!receipt || typeof receipt.token !== 'string' || receipt.dir !== dir || !Array.isArray(receipt.days)
    || !receipt.counts || typeof receipt.counts !== 'object') {
    throw new Error('Access export marker does not match storage; refusing table removal')
  }
  if (!(await stat(dir))?.isDirectory()) throw new Error('Access migration storage missing; refusing table removal')
  const file = await regular(resolve(dir, RECEIPT))
  try {
    let disk: Receipt
    try { disk = JSON.parse(await file.readFile('utf8')) as Receipt } catch {
      throw new Error('Invalid access migration receipt JSON; refusing table removal')
    }
    if (!disk || disk.token !== receipt.token || disk.dir !== receipt.dir || JSON.stringify(disk.days) !== JSON.stringify(receipt.days)
      || receipt.days.some(day => disk.counts?.[day] !== receipt.counts[day])) {
      throw new Error('Access migration receipt mismatch; refusing table removal')
    }
  } finally { await file.close() }
  await verifyDayCounts(dir, receipt.days, receipt.counts)
}

/** Single-process migration; callers must stop all old-version writers before rollout. */
export async function migrateAccessLogs(options: AccessMigrationOptions) {
  if (await options.getMarker(ACCESS_EXPORTED_KEY)) return
  const saved = await options.getMarker(ACCESS_MIGRATION_KEY)
  let state: Checkpoint
  if (saved) {
    state = saved as Checkpoint
    if (state.dir !== options.dir || !Number.isFinite(Date.parse(state.cutoff)) || !Array.isArray(state.days)
      || !Number.isSafeInteger(state.total) || state.total < 0 || !state.counts || typeof state.counts !== 'object') {
      throw new Error('Invalid access migration checkpoint/storage')
    }
    // A lost/truncated mount must never let a DB cursor skip rows that no longer exist on disk.
    await verifyDayCounts(options.dir, state.days, state.counts)
  } else {
    const days = options.settings.retention_access_days
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Invalid migration retention')
    state = { dir: options.dir, cutoff: new Date(options.now.getTime() - days * 86_400_000).toISOString(), total: 0, days: [], counts: {} }
    await options.setMarker(ACCESS_MIGRATION_KEY, state)
  }
  const commit = async (rows: Record<string, unknown>[]) => {
    const byDay = new Map<string, AccessLogEntry[]>()
    for (const row of rows) {
      const entry = migrationEntry(row, options.settings)
      if (entry.timestamp! < state.cutoff) continue
      const day = entry.timestamp!.slice(0, 10)
      const entries = byDay.get(day) ?? []
      entries.push(entry)
      byDay.set(day, entries)
    }
    const counts = { ...state.counts }
    await options.exclusive(async (dir) => {
      if (dir !== options.dir) throw new Error('Access migration directory changed')
      for (const [day, entries] of byDay) counts[day] = await mergeMigrationDay(dir, entries)
    })
    state = { ...state, counts, days: [...new Set([...state.days, ...byDay.keys()])].sort() }
  }
  if (await options.tableExists()) {
    while (true) {
      const rows = await options.loadPage(state.cutoff, state.cursor)
      if (!rows.length) break
      // Reject unsupported IDs anywhere in the page, not just the final cursor row.
      for (const row of rows) migrationCursor(row)
      const cursor = migrationCursor(rows[rows.length - 1]!)
      if (state.cursor && (Date.parse(cursor.timestamp) < Date.parse(state.cursor.timestamp)
        || (cursor.timestamp === state.cursor.timestamp && cursor.id === state.cursor.id))) throw new Error('Access migration cursor did not advance')
      await commit(rows)
      state = { ...state, cursor, total: state.total + rows.length }
      await options.setMarker(ACCESS_MIGRATION_KEY, state)
      if (Math.floor(state.total / 50_000) !== Math.floor((state.total - rows.length) / 50_000)) options.progress?.(state.total)
    }
  }
  // Legacy location is independent of ACCESS_LOG_DIR. Never remove unknown files or symlinks.
  const legacy = await stat(options.legacyDir)
  if (legacy && !legacy.isDirectory()) throw new Error('Unsafe legacy access buffer directory')
  if (legacy) {
    for (const entry of await readdir(options.legacyDir, { withFileTypes: true })) {
      if (!/^access-buffer\.ndjson(?:\.\d+\.flushing)?$/.test(entry.name)) continue
      if (!entry.isFile()) throw new Error('Unsafe legacy access buffer source')
      const path = resolve(options.legacyDir, entry.name)
      const original = await lstat(path)
      let batch: Record<string, unknown>[] = []
      for await (const line of lines(path)) {
        if (!line.trim()) continue
        let row: unknown
        try { row = JSON.parse(line) } catch {
          // Native JSON errors can echo source content (including credentials).
          throw new Error('Invalid legacy access buffer JSON; source retained')
        }
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid legacy access buffer line')
        batch.push(row as Record<string, unknown>)
        if (batch.length >= PAGE_SIZE) { await commit(batch); batch = [] }
      }
      await commit(batch)
      // Persist the day inventory before deleting the only remaining source.
      await options.setMarker(ACCESS_MIGRATION_KEY, state)
      await assertUnchanged(path, original)
      await unlink(path)
      await syncDirectory(options.legacyDir)
    }
  }
  await options.maintain()
  // A matching durable filesystem receipt guards against DB-only restores/lost mounts.
  const receipt: Receipt = { token: randomUUID(), dir: options.dir, days: state.days, counts: state.counts }
  await publishReceipt(options.dir, receipt)
  await options.setMarker(ACCESS_EXPORTED_KEY, receipt)
}

async function marker(db: Db, key: string) {
  return firstRow<{ value?: unknown }>(await queryDb(db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;', { key },
    { label: `access migration marker ${key}`, timeoutMs: 5000, retryOnReconnect: false }))?.value
}
async function setMarker(db: Db, key: string, value: unknown) {
  // Canonical IDs, matching the app_settings convention; clean old duplicate keys first.
  await queryDb(db, 'DELETE FROM app_settings WHERE key = $key AND id != type::record($table, $id);',
    { key, table: 'app_settings', id: key }, { label: 'access migration marker dedup', timeoutMs: 5000, retryOnReconnect: false })
  await queryDb(db, 'UPSERT type::record($table, $id) CONTENT { key: $key, value: $value, updated_at: time::now() };',
    { key, value, table: 'app_settings', id: key }, { label: `access migration save ${key}`, timeoutMs: 10_000, retryOnReconnect: false })
}
async function tableExists(db: Db) {
  const response = await queryDb(db, 'INFO FOR DB;', undefined, { label: 'access migration table inventory', timeoutMs: 10_000, retryOnReconnect: false })
  const info = (Array.isArray(response) ? response[0] : response) as { tables?: Record<string, unknown> }
  if (!info || !info.tables) throw new Error('Invalid access migration database inventory')
  return Object.hasOwn(info.tables, 'access_logs')
}

export async function runAccessLogMigration(db: Db, settings: LoggingSettings) {
  try {
    await migrateAccessLogs({
      dir: accessLogDir(), legacyDir: resolve(process.cwd(), 'storage/logs'), now: new Date(), settings,
      getMarker: key => marker(db, key), setMarker: (key, value) => setMarker(db, key, value),
      tableExists: () => tableExists(db),
      loadPage: async (cutoff, cursor) => queryRows<Record<string, unknown>>(await queryDb(db,
        `SELECT * FROM access_logs WITH NOINDEX WHERE timestamp >= <datetime>$cutoff
         ${cursor ? "AND (timestamp > <datetime>$cursor_ts OR (timestamp = <datetime>$cursor_ts AND id > type::record('access_logs', $cursor_id)))" : ''}
         ORDER BY timestamp ASC, id ASC LIMIT $limit;`,
        { cutoff, cursor_ts: cursor?.timestamp, cursor_id: cursor?.numericId !== undefined
          ? BigInt(cursor.numericId) : cursor?.id.slice('access_logs:'.length), limit: PAGE_SIZE },
        { label: 'access migration export page', timeoutMs: 30_000, retryOnReconnect: false })),
      exclusive: withAccessLogMutation,
      maintain: () => maintainAccessLogFiles(new Date(), settings.retention_access_days),
      progress: total => writeConsoleEntry({ kind: 'app', level: 'info', msg: '[logging] access migration progress', ctx: { exported: total } }, settings)
    })
  } catch (error) {
    writeConsoleEntry({ kind: 'app', level: 'warn', msg: '[logging] access migration failed; sources retained, retry on next boot', err: error }, settings)
  }
}

/** Only owned boot may perform receipt-verified removal. DATABASE EDITOR has
 * table-DDL authority; ROOT bootstrap never runs application migrations. */
export async function removeMigratedAccessTable(db: Db) {
  const exported = await marker(db, ACCESS_EXPORTED_KEY)
  if (!exported) return
  const removed = await marker(db, ACCESS_REMOVED_KEY)
  const exists = await tableExists(db)
  if (removed && exists) {
    // A restored legacy table is new source data, not permission to discard it.
    await queryDb(db, 'DELETE FROM app_settings WHERE key IN $keys;',
      { keys: [ACCESS_EXPORTED_KEY, ACCESS_REMOVED_KEY, ACCESS_MIGRATION_KEY] },
      { label: 'access migration reset after restore', timeoutMs: 10_000, retryOnReconnect: false })
    return
  }
  if (removed && !exists) return
  if (exists) {
    await verifyAccessMigrationReceipt(exported, accessLogDir())
    await queryDb(db, 'REMOVE TABLE access_logs;', undefined,
      { label: 'access migration remove table', timeoutMs: 30_000, retryOnReconnect: false })
  }
  // Even when marked removed, check the inventory again: an old backup may recreate the table.
  await setMarker(db, ACCESS_REMOVED_KEY, new Date().toISOString())
}
