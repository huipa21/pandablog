import { rm } from 'node:fs/promises'
import * as path from 'node:path'
import { queryDb, useDb } from '../db'
import { firstRow, queryRows } from '../surrealResult'
import type { BackupRecord } from './config'
import { BACKUPS_ROOT } from './config'
export function normalizeBackupRecord(raw: Record<string, unknown>): BackupRecord {
  const id = String((raw.id as any)?.id ?? raw.id ?? '')
  return {
    id: id.startsWith('backups:') ? id : `backups:${id}`,
    type: raw.type === 'incremental' ? 'incremental' : raw.type === 'partial' ? 'partial' : 'full',
    status: (['creating', 'ready', 'failed', 'restoring'] as const).includes(raw.status as any)
      ? (raw.status as BackupRecord['status'])
      : 'failed',
    note: raw.note ? String(raw.note) : null,
    parent: raw.parent ? String(raw.parent) : null,
    chain_root: raw.chain_root ? String(raw.chain_root) : null,
    included_hashes: Array.isArray(raw.included_hashes)
      ? (raw.included_hashes as unknown[]).filter((v): v is string => typeof v === 'string')
      : [],
    included_tables: Array.isArray(raw.included_tables)
      ? (raw.included_tables as unknown[]).filter((v): v is string => typeof v === 'string')
      : null,
    db_size_bytes: Number(raw.db_size_bytes ?? 0),
    media_size_bytes: Number(raw.media_size_bytes ?? 0),
    media_file_count: Number(raw.media_file_count ?? 0),
    manifest_sha256_db: raw.manifest_sha256_db ? String(raw.manifest_sha256_db) : null,
    manifest_sha256_media: raw.manifest_sha256_media ? String(raw.manifest_sha256_media) : null,
    created_at: raw.created_at ? String(raw.created_at) : new Date().toISOString(),
    completed_at: raw.completed_at ? String(raw.completed_at) : null,
    error: raw.error ? String(raw.error) : null,
  }
}

export function backupIdPart(id: string): string {
  return id.replace(/^backups:/, '')
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
  const res = await queryDb(db, 'SELECT * FROM backups ORDER BY created_at DESC;', undefined, { label: 'list backups' })
  return queryRows<Record<string, unknown>>(res).map(normalizeBackupRecord)
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
  type: 'full' | 'incremental' | 'partial'
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
      note: $note,
      parent: $parent,
      chain_root: $chain_root,
      included_hashes: $included_hashes,
      included_tables: $included_tables,
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
    setClauses.push(`${key} = $${paramKey}`)
    params[paramKey] = val
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
 * Returns the set of all media hashes that are known to be in the snapshot chain
 * rooted at (or including) the given snapshot ID's ancestors.
 * This is used to compute which media files are "new" for an incremental.
 */
export async function chainHashUnion(id: string): Promise<Set<string>> {
  const visited = new Set<string>()
  const hashes = new Set<string>()
  let currentId: string | null = id

  while (currentId) {
    const key = currentId
    if (visited.has(key)) break
    visited.add(key)

    const record = await getBackup(key)
    if (!record) break

    for (const h of record.included_hashes) {
      hashes.add(h)
    }

    currentId = record.parent
  }

  return hashes
}

/**
 * Walks down descendants of `id` to find any backups that reference it as parent.
 */
export async function getDirectDescendants(id: string): Promise<BackupRecord[]> {
  const db = await useDb()
  const res = await queryDb(
    db,
    'SELECT * FROM backups WHERE parent = $parent;',
    { parent: id },
    { label: 'get backup descendants' }
  )
  return queryRows<Record<string, unknown>>(res).map(normalizeBackupRecord)
}

/**
 * Returns the names of all user-defined tables in the current database.
 */
export async function listDatabaseTables(): Promise<string[]> {
  const db = await useDb()
  const info = await queryDb<unknown[]>(db, 'INFO FOR DB;', undefined, {
    label: 'info for db (list tables)',
    timeoutMs: 20_000,
  })
  const entry = (Array.isArray(info) ? info[0] : info) as Record<string, unknown> | null
  const root = (entry && typeof entry === 'object' && 'result' in entry
    ? (entry as { result?: unknown }).result
    : entry) as Record<string, unknown> | null
  const tables = root?.tables
  if (tables && typeof tables === 'object') {
    return Object.keys(tables).sort()
  }
  return []
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
  const db = await useDb()
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
  const quote = (name: string) => '`' + name.replace(/`/g, '') + '`'

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
      statements.push(`REMOVE FUNCTION IF EXISTS fn::${fnName};`)
    }
  }

  const params = root?.params
  if (params && typeof params === 'object') {
    for (const name of Object.keys(params)) {
      const paramName = name.startsWith('$') ? name.slice(1) : name
      statements.push(`REMOVE PARAM IF EXISTS $${paramName};`)
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
  })
}

/**
 * After a wipe + import, the `backups` table holds snapshot-era records. This
 * replaces them with the supplied (current) records so the backup history and
 * on-disk snapshots stay in sync regardless of which point we restored to.
 */
export async function replaceBackupRecords(records: BackupRecord[]): Promise<void> {
  const db = await useDb()

  const statements: string[] = ['DELETE backups;']
  const params: Record<string, unknown> = {}

  records.forEach((rec, i) => {
    params[`id_${i}`] = backupIdPart(rec.id)
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

    const completedExpr = params[`completed_${i}`] ? `$completed_${i}` : 'NONE'

    statements.push(`CREATE type::record('backups', $id_${i}) CONTENT {
      type: $type_${i},
      status: $status_${i},
      note: $note_${i},
      parent: $parent_${i},
      chain_root: $chain_root_${i},
      included_hashes: $hashes_${i},
      included_tables: $tables_${i},
      db_size_bytes: $dbsize_${i},
      media_size_bytes: $mediasize_${i},
      media_file_count: $count_${i},
      manifest_sha256_db: $sdb_${i},
      manifest_sha256_media: $smedia_${i},
      created_at: $created_${i},
      completed_at: ${completedExpr},
      error: $error_${i}
    };`)
  })

  await queryDb(db, statements.join('\n'), params, {
    label: 'replace backup records',
    timeoutMs: 30_000,
  })
}

/** Removes a snapshot's on-disk directory (db dump, media tar, manifest). */
export async function deleteSnapshotFiles(id: string): Promise<void> {
  const dir = path.join(BACKUPS_ROOT, backupIdPart(id))
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

/**
 * Enforces a count-based retention policy: keeps the `max` most-recent READY
 * snapshots and deletes the rest (records + on-disk files).
 *
 * Snapshots that are ancestors (direct parent / chain root) of a kept snapshot
 * are preserved regardless of age, so partial/incremental chains stay
 * restorable. Non-ready snapshots (creating/restoring) are never pruned.
 *
 * Returns the list of pruned snapshot ids.
 */
export async function pruneBackups(max: number): Promise<string[]> {
  if (!Number.isFinite(max) || max <= 0) return []

  const all = await listBackups()
  const ready = all.filter((b) => b.status === 'ready')

  // Newest-first (listBackups already orders by created_at DESC).
  const keep = new Set<string>()
  const kept: BackupRecord[] = []
  for (const rec of ready) {
    if (kept.length < max) {
      kept.push(rec)
      keep.add(backupIdPart(rec.id))
    }
  }

  // Preserve ancestors of kept snapshots so chains remain restorable.
  const byId = new Map(all.map((b) => [backupIdPart(b.id), b]))
  for (const rec of kept) {
    let parent = rec.parent ? backupIdPart(rec.parent) : null
    const guard = new Set<string>()
    while (parent && !guard.has(parent)) {
      guard.add(parent)
      keep.add(parent)
      parent = byId.get(parent)?.parent ? backupIdPart(byId.get(parent)!.parent!) : null
    }
    if (rec.chain_root) keep.add(backupIdPart(rec.chain_root))
  }

  const pruned: string[] = []
  for (const rec of ready) {
    const idPart = backupIdPart(rec.id)
    if (keep.has(idPart)) continue
    await deleteSnapshotFiles(rec.id)
    await deleteBackupRecord(rec.id)
    pruned.push(rec.id)
  }

  return pruned
}
