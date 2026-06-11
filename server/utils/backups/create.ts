import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { BACKUPS_ROOT } from './config'
import { chainHashUnion, createBackupRecord, getBackup, pruneBackups, updateBackupRecord } from './registry'
import { acquireJob, releaseJob, updateJobProgress } from './jobMutex'
import { exportSurrealDb, sha256File } from './surrealHttp'
import { collectOriginalPaths, createMediaTar } from './tarStream'
import { getBackupSettings } from '../settings'

export interface CreateBackupOptions {
  type: 'full' | 'incremental' | 'partial'
  note?: string | null
  parent?: string | null
  /** For partial backups: the subset of tables to capture. */
  tables?: string[] | null
}

/**
 * Generates an id, acquires the mutex, creates the DB record, and starts the
 * backup work in the background. Returns the new snapshot id immediately so the
 * caller can return it to the client.
 */
export async function startBackupJob(options: CreateBackupOptions): Promise<string> {
  const { type, note = null, parent = null, tables = null } = options

  // Resolve chain info for incrementals
  let chainRoot: string | null = null
  let ancestorHashes = new Set<string>()

  if (type === 'incremental') {
    if (!parent) {
      throw createError({ statusCode: 400, message: 'Incremental backups require a parent snapshot id.' })
    }
    ancestorHashes = await chainHashUnion(parent)
    const parentRecord = await getBackup(parent)
    if (!parentRecord) {
      throw createError({ statusCode: 404, message: 'Parent backup not found.' })
    }
    chainRoot = parentRecord.chain_root ?? parentRecord.id
  }

  let includedTables: string[] | null = null
  if (type === 'partial') {
    if (!parent) {
      throw createError({ statusCode: 400, message: 'Partial backups require a base full backup as parent.' })
    }
    const parentRecord = await getBackup(parent)
    if (!parentRecord) {
      throw createError({ statusCode: 404, message: 'Parent backup not found.' })
    }
    if (parentRecord.type !== 'full') {
      throw createError({ statusCode: 400, message: 'A partial backup must be based on a full backup.' })
    }
    const cleaned = (tables ?? []).filter((t) => typeof t === 'string' && t.trim().length > 0)
    if (!cleaned.length) {
      throw createError({ statusCode: 400, message: 'Partial backups require at least one table.' })
    }
    includedTables = Array.from(new Set(cleaned))
    chainRoot = parentRecord.chain_root ?? parentRecord.id
  }

  const id = generateBackupId()

  // Acquire mutex before creating the record so the 409 fires correctly.
  await acquireJob({ id, kind: 'create', startedAt: new Date().toISOString() })

  // Create DB record synchronously so the id is visible in the list immediately.
  // If this fails we must release the mutex here: runBackupWork (which owns the
  // releaseJob in its finally) is never reached, so the lock would otherwise leak
  // and every future job would return 409 until the process restarts.
  try {
    await createBackupRecord({
      id,
      type,
      note,
      parent,
      chain_root: chainRoot,
      included_hashes: [],
      included_tables: includedTables,
    })
  } catch (err) {
    await releaseJob()
    throw err
  }

  // Fire the rest of the work in the background.
  runBackupWork(id, type, parent, chainRoot, ancestorHashes, includedTables).catch((err) => {
    if (import.meta.dev) {
      console.error(`[backup] create job ${id} failed:`, err?.message)
    }
  })

  return id
}

async function runBackupWork(
  id: string,
  type: 'full' | 'incremental' | 'partial',
  parent: string | null,
  chainRoot: string | null,
  ancestorHashes: Set<string>,
  includedTables: string[] | null
): Promise<void> {
  try {
    const backupDir = path.join(BACKUPS_ROOT, id)
    await mkdir(backupDir, { recursive: true })
    updateJobProgress({ phase: 'preparing', percent: 2 })

    // --- 1. Export and gzip the database ---
    updateJobProgress({ phase: 'db-export', percent: 5 })
    const dbOutPath = path.join(backupDir, 'db.surql.gz')
    const selection = type === 'partial' && includedTables?.length ? { tables: includedTables } : undefined
    const dbStream = await exportSurrealDb(selection)
    const gzip = createGzip({ level: 6 })
    await pipeline(dbStream, gzip, createWriteStream(dbOutPath))
    const dbStat = await stat(dbOutPath)
    const dbSha256 = await sha256File(dbOutPath)
    updateJobProgress({ phase: 'db-export', percent: 40 })

    // --- 2. Collect media originals ---
    updateJobProgress({ phase: 'media-collect', percent: 44 })
    const uploadsRoot = path.resolve(process.cwd(), 'storage/uploads')
    const allOriginals = await collectOriginalPaths(uploadsRoot)

    let toArchive: string[]
    if (type === 'full') {
      toArchive = allOriginals
    } else if (type === 'partial') {
      // Partial backups capture only a table subset; media is provided by the
      // base full backup during a consolidated restore.
      toArchive = []
    } else {
      // Incremental: only files whose hash part is NOT in ancestor chain
      toArchive = allOriginals.filter((rel) => {
        const hashPart = path.basename(rel).replace(/\.[^.]+$/, '')
        return !ancestorHashes.has(hashPart)
      })
    }

    // --- 3. Pack media (45% → 90%, scaled by file count) ---
    updateJobProgress({
      phase: 'media-pack',
      percent: 45,
      detail: `0 / ${toArchive.length}`,
    })
    const mediaOutPath = path.join(backupDir, 'media.tar.gz')
    await createMediaTar(toArchive, uploadsRoot, mediaOutPath, 1, (processed, total) => {
      const fraction = total > 0 ? processed / total : 1
      updateJobProgress({
        phase: 'media-pack',
        percent: 45 + fraction * 45,
        detail: `${processed} / ${total}`,
      })
    })
    const mediaStat = await stat(mediaOutPath)
    const mediaSha256 = await sha256File(mediaOutPath)
    updateJobProgress({ phase: 'finalize', percent: 95 })

    const includedHashes = toArchive.map((rel) => path.basename(rel).replace(/\.[^.]+$/, ''))

    // --- 4. Write manifest ---
    const manifest = {
      id,
      type,
      parent: parent ?? null,
      chain_root: chainRoot ?? null,
      created_at: new Date().toISOString(),
      sha256_db: dbSha256,
      sha256_media: mediaSha256,
      media_file_count: toArchive.length,
      included_hashes: includedHashes,
      included_tables: includedTables ?? null,
    }
    await writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

    // --- 5. Mark ready ---
    await updateBackupRecord(id, {
      status: 'ready',
      included_hashes: includedHashes,
      db_size_bytes: dbStat.size,
      media_size_bytes: mediaStat.size,
      media_file_count: toArchive.length,
      manifest_sha256_db: dbSha256,
      manifest_sha256_media: mediaSha256,
      completed_at: new Date().toISOString(),
    })

    // --- 6. Prune old backups per retention setting (ancestors preserved) ---
    try {
      const settings = await getBackupSettings()
      if (settings.max_backups > 0) {
        await pruneBackups(settings.max_backups)
      }
    } catch (pruneErr) {
      if (import.meta.dev) {
        console.warn('[backup] prune failed:', (pruneErr as Error)?.message)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updateBackupRecord(id, {
      status: 'failed',
      error: message,
      completed_at: new Date().toISOString(),
    }).catch(() => {})
    const backupDir = path.join(BACKUPS_ROOT, id)
    await rm(backupDir, { recursive: true, force: true }).catch(() => {})
  } finally {
    await releaseJob()
  }
}

function generateBackupId(): string {
  const now = new Date()
  const ts = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('')
  const rand = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
  return `${ts}${rand}`
}
