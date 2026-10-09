import { RecordId } from 'surrealdb'
import { lstat, opendir, rm, rmdir } from 'node:fs/promises'
import * as path from 'node:path'
import { closeRootClient, connectRootClient, queryDb, useDb } from '../db'
import { firstRow, queryRows } from '../surrealResult'
import type { BackupRecord } from './config'
import { BACKUPS_ROOT } from './config'
import { supportedFull } from './contracts'
import { reserveSnapshotDeletion, snapshotHasReaders } from './snapshotReads'
// Raw pre-wipe rows are private, never returned as API diagnostics. Preserve
// unknown legacy fields/types byte-for-value during history reconciliation.
const historyRows = new WeakMap<BackupRecord, Record<string, unknown>>()
const historyIds = new WeakMap<BackupRecord, RecordId>()
export function normalizeBackupRecord(raw: Record<string, unknown>): BackupRecord {
  const id = String((raw.id as any)?.id ?? raw.id ?? '')
  const record: BackupRecord = {
    id: id.startsWith('backups:') ? id : `backups:${id}`,
    type: typeof raw.type === 'string' ? raw.type : null,
    ...(raw.format_version != null ? {format_version: typeof raw.format_version === 'number' ? raw.format_version : Number.NaN} : {}),
    ...(raw.bundle_filename != null ? {bundle_filename: String(raw.bundle_filename)} : {}),
    ...(raw.bundle_size_bytes != null ? {bundle_size_bytes: typeof raw.bundle_size_bytes === 'number' ? raw.bundle_size_bytes : Number.NaN} : {}),
    ...(raw.bundle_sha256 != null ? {bundle_sha256: String(raw.bundle_sha256)} : {}),
    status: (['creating', 'ready', 'failed', 'restoring'] as const).includes(raw.status as any)
      ? (raw.status as BackupRecord['status'])
      : 'failed',
    note: raw.note ? String(raw.note) : null,
    parent: raw.parent == null ? null : String(raw.parent),
    chain_root: raw.chain_root == null ? null : String(raw.chain_root),
    included_hashes: Array.isArray(raw.included_hashes)
      ? (raw.included_hashes as unknown[]).filter((v): v is string => typeof v === 'string')
      : [],
    included_tables: Array.isArray(raw.included_tables)
      ? (raw.included_tables as unknown[]).filter((v): v is string => typeof v === 'string')
      : raw.included_tables == null ? null : [],
    db_size_bytes: Number(raw.db_size_bytes ?? 0),
    media_size_bytes: Number(raw.media_size_bytes ?? 0),
    media_file_count: Number(raw.media_file_count ?? 0),
    manifest_sha256_db: raw.manifest_sha256_db ? String(raw.manifest_sha256_db) : null,
    manifest_sha256_media: raw.manifest_sha256_media ? String(raw.manifest_sha256_media) : null,
    created_at: raw.created_at ? String(raw.created_at) : new Date().toISOString(),
    completed_at: raw.completed_at ? String(raw.completed_at) : null,
    error: raw.error ? String(raw.error) : null,
  }
  const {id: _id, ...content} = raw
  historyRows.set(record, content)
  if (raw.id instanceof RecordId) historyIds.set(record, raw.id)
  return record
}

export function backupIdPart(id: string): string {
  const part = id.replace(/^backups:/, '')
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(part)) throw new Error('Invalid backup identifier')
  return part
}

/** Coerces an ISO string / Date into a JS Date for safe datetime binding. */
function toBackupDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }
  return null
}

export async function listBackups(): Promise<BackupRecord[]> {
  const db = await useDb()
  const res = await queryDb(db, 'SELECT * FROM backups ORDER BY created_at DESC LIMIT 129;', undefined, { label: 'list backups', retry: 'readOnly' })
  const rows = queryRows<Record<string, unknown>>(res)
  if (rows.length > 128 || Buffer.byteLength(JSON.stringify(rows)) > 16 * 1024 * 1024) throw new Error('Backup history budget exceeded; offline history reconciliation required')
  return rows.map(normalizeBackupRecord)
}

export async function getBackup(id: string): Promise<BackupRecord | null> {
  const db = await useDb()
  const safeId = backupIdPart(id)
  const res = await queryDb(
    db,
    'SELECT * FROM type::record($table, $id) LIMIT 1;',
    { table: 'backups', id: safeId },
    { label: 'get backup' }
  )
  const raw = firstRow<Record<string, unknown>>(res)
  return raw ? normalizeBackupRecord(raw) : null
}

export async function createBackupRecord(data: {
  id: string
  type: 'full'
  note: string | null
  parent: string | null
  chain_root: string | null
  included_hashes: string[]
  included_tables?: string[] | null
}): Promise<BackupRecord> {
  const db = await useDb()
  const res = await queryDb(
    db,
    `CREATE type::record($table, $id) CONTENT {
      type: $type,
      status: 'creating',
      note: $note ?? NONE,
      parent: $parent ?? NONE,
      chain_root: $chain_root ?? NONE,
      included_hashes: $included_hashes,
      included_tables: $included_tables ?? NONE,
      db_size_bytes: 0,
      media_size_bytes: 0,
      media_file_count: 0,
      manifest_sha256_db: NONE,
      manifest_sha256_media: NONE,
      created_at: time::now(),
      completed_at: NONE,
      error: NONE
    };`,
    {
      table: 'backups',
      id: data.id,
      type: data.type,
      note: data.note ?? null,
      parent: data.parent ?? null,
      chain_root: data.chain_root ?? null,
      included_hashes: data.included_hashes,
      included_tables: data.included_tables ?? null,
    },
    { label: 'create backup record' }
  )
  const raw = firstRow<Record<string, unknown>>(res)
  if (!raw) throw new Error('Failed to create backup record')
  return normalizeBackupRecord(raw)
}

export async function updateBackupRecord(
  id: string,
  fields: Partial<Omit<BackupRecord, 'id' | 'type' | 'created_at' | 'parent' | 'chain_root'>>
): Promise<BackupRecord | null> {
  const db = await useDb()
  const safeId = backupIdPart(id)

  const setClauses: string[] = []
  const params: Record<string, unknown> = { table: 'backups', id: safeId }

  for (const [key, val] of Object.entries(fields)) {
    if (val === undefined) continue
    const paramKey = `field_${key}`
    if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error('Invalid backup metadata field')
    setClauses.push(`${key} = $${paramKey} ?? NONE`)
    params[paramKey] = key === 'completed_at' ? toBackupDate(val) : val
  }

  if (!setClauses.length) return getBackup(id)

  const res = await queryDb(
    db,
    `UPDATE type::record($table, $id) SET ${setClauses.join(', ')} RETURN AFTER;`,
    params,
    { label: 'update backup record' }
  )
  const raw = firstRow<Record<string, unknown>>(res)
  return raw ? normalizeBackupRecord(raw) : null
}

export async function deleteBackupRecord(id: string): Promise<void> {
  const db = await useDb()
  const safeId = backupIdPart(id)
  await queryDb(
    db,
    'DELETE FROM type::record($table, $id);',
    { table: 'backups', id: safeId },
    { label: 'delete backup record' }
  )
}

/**
 * Wipes every user-defined table, analyzer, function, param and access from the
 * current database so a snapshot can be imported into a clean slate.
 *
 * SurrealDB's export does NOT contain REMOVE statements — it only has
 * `DEFINE ...` + `INSERT ...`. Importing onto a populated database therefore
 * leaves behind any records created after the snapshot and conflicts with the
 * non-OVERWRITE DEFINE statements. Removing everything first guarantees the
 * import is a true point-in-time replacement.
 */
export async function wipeDatabase(): Promise<void> {
  const db = await connectRootClient()
  try {
    await wipeWithRoot(db)
  } finally { await closeRootClient(db) }
}

async function wipeWithRoot(db: Awaited<ReturnType<typeof connectRootClient>>): Promise<void> {
  const info = await queryDb<unknown[]>(db, 'INFO FOR DB;', undefined, {
    label: 'info for db (wipe)',
    timeoutMs: 20_000,
  })
  const entry = (Array.isArray(info) ? info[0] : info) as Record<string, unknown> | null
  // Some SurrealDB SDK versions wrap each statement result in { result, status }.
  const root = (entry && typeof entry === 'object' && 'result' in entry
    ? (entry as { result?: unknown }).result
    : entry) as Record<string, unknown> | null

  const statements: string[] = []
  const quote = (name: string) => '`' + name.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`'

  const tables = root?.tables
  if (tables && typeof tables === 'object') {
    for (const name of Object.keys(tables)) {
      statements.push(`REMOVE TABLE IF EXISTS ${quote(name)};`)
    }
  }

  const analyzers = root?.analyzers
  if (analyzers && typeof analyzers === 'object') {
    for (const name of Object.keys(analyzers)) {
      statements.push(`REMOVE ANALYZER IF EXISTS ${quote(name)};`)
    }
  }

  const functions = root?.functions
  if (functions && typeof functions === 'object') {
    for (const name of Object.keys(functions)) {
      const fnName = name.startsWith('fn::') ? name.slice(4) : name
      if (!/^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*$/.test(fnName)) throw new Error('Unsupported function identifier during wipe')
      statements.push(`REMOVE FUNCTION IF EXISTS fn::${fnName};`)
    }
  }

  const params = root?.params
  if (params && typeof params === 'object') {
    for (const name of Object.keys(params)) {
      const paramName = name.startsWith('$') ? name.slice(1) : name
      statements.push(`REMOVE PARAM IF EXISTS $${quote(paramName)};`)
    }
  }

  const accesses = root?.accesses
  if (accesses && typeof accesses === 'object') {
    for (const name of Object.keys(accesses)) {
      statements.push(`REMOVE ACCESS IF EXISTS ${quote(name)} ON DATABASE;`)
    }
  }

  if (!statements.length) return

  await queryDb(db, statements.join('\n'), undefined, {
    label: 'wipe database',
    timeoutMs: 60_000,
    retry: 'never',
  })
}

/**
 * After a wipe + import, the `backups` table holds snapshot-era records. This
 * replaces them with the supplied (current) records so the backup history and
 * on-disk snapshots stay in sync regardless of which point we restored to.
 */
export async function replaceBackupRecords(records: BackupRecord[]): Promise<void> {
  const db = await useDb()

  if (records.length > 128 || Buffer.byteLength(JSON.stringify(records)) > 16 * 1024 * 1024) throw new Error('Backup history budget exceeded')
  const statements: string[] = ['BEGIN TRANSACTION;', 'DELETE backups WHERE id NOT IN $savedIds;']
  const params: Record<string, unknown> = {savedIds: records.map(record => historyIds.get(record) ?? new RecordId('backups', backupIdPart(record.id)))}

  records.forEach((rec, i) => {
    params[`id_${i}`] = historyIds.get(rec)?.id ?? backupIdPart(rec.id)
    const raw = historyRows.get(rec)
    if (raw) {
      params[`raw_${i}`] = raw
      statements.push(`UPSERT type::record('backups', $id_${i}) CONTENT $raw_${i};`)
      return
    }
    params[`type_${i}`] = rec.type
    params[`status_${i}`] = rec.status
    params[`note_${i}`] = rec.note
    params[`parent_${i}`] = rec.parent
    params[`chain_root_${i}`] = rec.chain_root
    params[`hashes_${i}`] = rec.included_hashes
    params[`tables_${i}`] = rec.included_tables
    params[`dbsize_${i}`] = rec.db_size_bytes
    params[`mediasize_${i}`] = rec.media_size_bytes
    params[`count_${i}`] = rec.media_file_count
    params[`sdb_${i}`] = rec.manifest_sha256_db
    params[`smedia_${i}`] = rec.manifest_sha256_media
    // Bind datetimes as JS Date objects so the driver serialises them as
    // SurrealDB datetimes (binding ISO strings can trigger coercion errors).
    params[`created_${i}`] = toBackupDate(rec.created_at) ?? new Date()
    params[`completed_${i}`] = toBackupDate(rec.completed_at)
    params[`error_${i}`] = rec.error
    params[`format_${i}`] = rec.format_version ?? null
    params[`bundlefile_${i}`] = rec.bundle_filename ?? null
    params[`bundlesize_${i}`] = rec.bundle_size_bytes ?? null
    params[`bundlesha_${i}`] = rec.bundle_sha256 ?? null

    const completedExpr = params[`completed_${i}`] ? `$completed_${i}` : 'NONE'

    statements.push(`UPSERT type::record('backups', $id_${i}) CONTENT {
      type: $type_${i},
      status: $status_${i},
      note: $note_${i} ?? NONE,
      parent: $parent_${i} ?? NONE,
      chain_root: $chain_root_${i} ?? NONE,
      included_hashes: $hashes_${i},
      included_tables: $tables_${i} ?? NONE,
      db_size_bytes: $dbsize_${i},
      media_size_bytes: $mediasize_${i},
      media_file_count: $count_${i},
      manifest_sha256_db: $sdb_${i} ?? NONE,
      manifest_sha256_media: $smedia_${i} ?? NONE,
      created_at: $created_${i},
      completed_at: ${completedExpr},
      error: $error_${i} ?? NONE,
      format_version: $format_${i} ?? NONE,
      bundle_filename: $bundlefile_${i} ?? NONE,
      bundle_size_bytes: $bundlesize_${i} ?? NONE,
      bundle_sha256: $bundlesha_${i} ?? NONE
    };`)
  })

  statements.push('COMMIT TRANSACTION;')
  await queryDb(db, statements.join('\n'), params, {
    label: 'replace backup records',
    timeoutMs: 30_000,
  })
}

/** Called under job serialization; reader reservation covers the actual unlink. */
export async function deleteSnapshotFiles(id: string): Promise<void> {
  const release = reserveSnapshotDeletion(id)
  try {
    const dir = path.join(BACKUPS_ROOT, backupIdPart(id))
    let info
    try {info = await lstat(dir)} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error}
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe backup deletion source')
    const files: string[] = [], allowed = new Set(['db.surql.gz', 'media.tar.gz', 'manifest.json', 'backup.tar.gz'])
    for await (const entry of await opendir(dir)) {
      if (!allowed.has(entry.name) || !entry.isFile() || files.length >= 4) throw new Error('Unknown backup artifacts preserved; offline reconciliation required')
      const file = path.join(dir, entry.name)
      if (!(await lstat(file)).isFile()) throw new Error('Unsafe backup deletion artifact')
      files.push(file)
    }
    for (const file of files) await rm(file)
    await rmdir(dir)
  } finally {release()}
}

/** Legacy evidence suspends pruning without walking or rewriting ancestry. */
export async function pruneBackups(max: number): Promise<string[]> {
  if (!Number.isFinite(max) || max <= 0) return []

  const all = await listBackups()
  if (all.some(record => !supportedFull(record))) return []
  const ready = all.filter(record => record.status === 'ready')
  const pruned: string[] = []
  for (const rec of ready.slice(Math.floor(max))) {
    if (snapshotHasReaders(rec.id)) continue
    await deleteSnapshotFiles(rec.id)
    await deleteBackupRecord(rec.id)
    pruned.push(rec.id)
  }

  return pruned
}
