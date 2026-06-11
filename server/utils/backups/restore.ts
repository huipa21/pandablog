import { readFile, mkdir, writeFile, rm, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Readable } from 'node:stream'
import { BACKUPS_ROOT } from './config'
import { backupIdPart, getBackup, listBackups, replaceBackupRecords, updateBackupRecord, wipeDatabase } from './registry'
import type { BackupRecord } from './config'
import { acquireJob, releaseJob, updateJobProgress } from './jobMutex'
import { exportSurrealDbToBuffer, importSurrealDb } from './surrealHttp'
import { consolidateDumps, validateDumpByStaging } from './validate'
import { clearDirectory, extractMediaTar } from './tarStream'
import { getBackupSettings, getMediaSettings, initializeRuntimeSettings } from '../settings'
import { initializeLoggingSettings } from '../logging'
import { queryDb, useDb } from '../db'
import { queryRows } from '../surrealResult'
import { mediaNormalizeFileRecord } from '../mediaLibrary'
import { mediaProcessImageBuffer } from '../imageProcessor'

/**
 * Acquires the mutex, marks the backup as restoring, fires the heavy work in background,
 * and returns immediately.
 */
export async function startRestoreJob(id: string): Promise<void> {
  const record = await getBackup(id)
  if (!record) {
    throw createError({ statusCode: 404, message: 'Backup snapshot not found.' })
  }
  if (record.status !== 'ready') {
    throw createError({ statusCode: 409, message: `Cannot restore a backup with status "${record.status}".` })
  }

  await acquireJob({ id, kind: 'restore', startedAt: new Date().toISOString() })

  // Mark as restoring BEFORE firing the background worker. If this fails we must
  // release the mutex here, because runRestoreWork (which owns the releaseJob in
  // its finally) is never reached — otherwise the lock leaks and every future
  // job returns 409 until the process restarts.
  try {
    await updateBackupRecord(id, { status: 'restoring' })
  } catch (err) {
    await releaseJob()
    throw err
  }

  runRestoreWork(id, record).catch((err) => {
    if (import.meta.dev) {
      console.error(`[backup] restore job ${id} failed:`, err?.message)
    }
  })
}

async function runRestoreWork(id: string, record: BackupRecord): Promise<void> {
  const safetyDir = path.join(BACKUPS_ROOT, '.safety')
  const safetyPath = path.join(safetyDir, `pre-restore-${backupIdPart(id)}-${Date.now()}.surql`)
  let safetyTaken = false

  // Media safety state — hoisted so the catch block can roll media back alongside
  // the database. Without this, a failed media extract (after the live uploads
  // were cleared) leaves the DB restored but the media gone, with no recovery.
  const uploadsRoot = path.resolve(process.cwd(), 'storage/uploads')
  const variantsRoot = path.resolve(process.cwd(), 'storage/variants')
  const mediaSafetyDir = path.join(safetyDir, `pre-restore-uploads-${backupIdPart(id)}-${Date.now()}`)
  let mediaSafetyTaken = false

  try {
    const settings = await getBackupSettings().catch(() => null)
    const validateBeforeRestore = settings?.validate_before_restore ?? true
    const autoSafetySnapshot = settings?.auto_safety_snapshot ?? true

    // --- 0. Snapshot the current backup history so it survives the wipe ---
    updateJobProgress({ phase: 'preparing', percent: 3 })
    const savedBackups = await listBackups().catch(() => [] as BackupRecord[])

    // --- 1. Resolve the DB dump to import (consolidate partial over its base) ---
    updateJobProgress({ phase: 'db-restore', percent: 8 })
    const dumpBuffer = await resolveRestoreDump(id, record, savedBackups)

    // --- 2. Validate the dump in a throwaway staging DB before touching live data ---
    if (validateBeforeRestore) {
      updateJobProgress({ phase: 'db-validate', percent: 18 })
      await validateDumpByStaging(dumpBuffer)
    }

    // --- 3. Take a safety snapshot of the CURRENT database for rollback ---
    if (autoSafetySnapshot) {
      updateJobProgress({ phase: 'safety-snapshot', percent: 26 })
      const current = await exportSurrealDbToBuffer()
      await mkdir(safetyDir, { recursive: true })
      await writeFile(safetyPath, current)
      safetyTaken = true
    }

    // --- 4. Wipe the database so the import is a true point-in-time replace ---
    updateJobProgress({ phase: 'db-wipe', percent: 34 })
    await wipeDatabase()

    // --- 5. Import the (possibly consolidated) snapshot dump ---
    updateJobProgress({ phase: 'db-restore', percent: 42 })
    await importSurrealDb(Readable.from(dumpBuffer))

    // --- 6. Verify the import actually populated the database ---
    updateJobProgress({ phase: 'db-verify', percent: 52 })
    await verifyRestore()

    // --- 7. Restore the current backup history (overwrites snapshot-era rows) ---
    // A failure here does NOT corrupt the restored data, but it leaves the
    // backups table out of sync with the on-disk snapshots. Surface it in the
    // final record instead of reporting a clean success.
    let historyWarning: string | null = null
    await replaceBackupRecords(savedBackups).catch((err) => {
      historyWarning = `Backup history could not be fully restored: ${err?.message ?? err}`
      if (import.meta.dev) {
        console.warn('[backup]', historyWarning)
      }
    })

    // --- 8. Build ancestor chain oldest-first (media) ---
    updateJobProgress({ phase: 'media-restore', percent: 60 })
    const chain: string[] = []
    let cursor: string | null = id
    while (cursor) {
      chain.unshift(cursor)
      const r = savedBackups.find((b) => b.id === cursor || backupIdPart(b.id) === backupIdPart(cursor!))
      cursor = r?.parent ?? null
    }

    // --- 9. Move the live media aside so it can roll back with the DB ---
    // Rename (atomic on the same volume) instead of deleting: if media extraction
    // fails below, the catch block restores this snapshot. Both paths live under
    // storage/, so the rename never crosses a filesystem boundary.
    if (existsSync(uploadsRoot)) {
      await mkdir(safetyDir, { recursive: true })
      await rename(uploadsRoot, mediaSafetyDir)
      mediaSafetyTaken = true
    }
    await mkdir(uploadsRoot, { recursive: true })

    // Clear variant cache (regenerated from the restored media below).
    await clearDirectory(variantsRoot).catch(() => {})

    // --- 10. Extract media tars oldest-first (fatal: a failure must roll back) ---
    for (const chainId of chain) {
      const chainDir = path.join(BACKUPS_ROOT, backupIdPart(chainId))
      const mediaTarPath = path.join(chainDir, 'media.tar.gz')
      if (!existsSync(mediaTarPath)) continue
      await extractMediaTar(mediaTarPath, uploadsRoot)
    }

    // --- 11. Refresh in-process caches ---
    updateJobProgress({ phase: 'finalize', percent: 92 })
    await initializeRuntimeSettings(true).catch(() => {})
    await initializeLoggingSettings().catch(() => {})

    await updateBackupRecord(id, { status: 'ready', error: historyWarning, completed_at: new Date().toISOString() })

    // --- 12. Discard the safety snapshots (restore succeeded) ---
    if (safetyTaken) {
      await rm(safetyPath, { force: true }).catch(() => {})
    }
    if (mediaSafetyTaken) {
      await rm(mediaSafetyDir, { recursive: true, force: true }).catch(() => {})
    }

    // --- 13. Background variant regen (non-fatal) ---
    regenerateVariantsBackground().catch((err) => {
      if (import.meta.dev) {
        console.warn('[backup] Variant regeneration failed:', err?.message)
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Attempt rollback to the pre-restore safety snapshot so the database is
    // never left empty or partially restored.
    let finalError = message
    let rolledBack = false
    if (safetyTaken) {
      try {
        updateJobProgress({ phase: 'rollback', percent: 50 })
        const safety = await readFile(safetyPath)
        await wipeDatabase()
        await importSurrealDb(Readable.from(safety))
        await replaceBackupRecords(await listBackups().catch(() => [])).catch(() => {})
        await initializeRuntimeSettings(true).catch(() => {})
        await initializeLoggingSettings().catch(() => {})
        rolledBack = true
        finalError = `${message} — restore was rolled back to the pre-restore state.`
        await rm(safetyPath, { force: true }).catch(() => {})
      } catch (rollbackErr) {
        const rbMsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
        finalError = `${message} — ROLLBACK ALSO FAILED: ${rbMsg}. A safety dump is preserved at ${safetyPath}.`
      }
    } else {
      finalError = `${message} — no safety snapshot was taken, so the database state could not be rolled back automatically.`
    }

    // Roll the media back to the pre-restore snapshot so it stays consistent with
    // the (rolled-back) database. Only attempt this if we actually moved it aside.
    if (mediaSafetyTaken) {
      try {
        await rm(uploadsRoot, { recursive: true, force: true })
        await rename(mediaSafetyDir, uploadsRoot)
        await clearDirectory(variantsRoot).catch(() => {})
        regenerateVariantsBackground().catch(() => {})
      } catch (mediaRollbackErr) {
        const mrMsg = mediaRollbackErr instanceof Error ? mediaRollbackErr.message : String(mediaRollbackErr)
        finalError = `${finalError} Media rollback ALSO FAILED: ${mrMsg}. Pre-restore media is preserved at ${mediaSafetyDir}.`
        rolledBack = false
      }
    }

    // Only report "ready" when we are certain the system was returned to a
    // consistent pre-restore state. Otherwise mark "failed" so the operator does
    // not treat a possibly-empty/half-restored database as restorable.
    const finalStatus: BackupRecord['status'] = rolledBack ? 'ready' : 'failed'
    await updateBackupRecord(id, { status: finalStatus, error: finalError }).catch(() => {})
    if (import.meta.dev) {
      console.error(`[backup] restore job ${id} failed:`, finalError)
    }
  } finally {
    await releaseJob()
  }
}

/**
 * Reads (and decompresses) the DB dump for a snapshot. For partial backups the
 * dump is consolidated on top of its base full backup so the restore replaces
 * the entire database rather than only the captured subset.
 */
async function resolveRestoreDump(
  id: string,
  record: BackupRecord,
  savedBackups: BackupRecord[]
): Promise<Buffer> {
  const ownDump = await readDbDump(id)

  if (record.type !== 'partial') {
    return ownDump
  }

  // Walk parents to find the nearest full backup as the base.
  const byId = new Map(savedBackups.map((b) => [backupIdPart(b.id), b]))
  let cursor: string | null = record.parent ? backupIdPart(record.parent) : null
  const guard = new Set<string>()
  let base: BackupRecord | null = null
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor)
    const r = byId.get(cursor) ?? (await getBackup(cursor))
    if (!r) break
    if (r.type === 'full') { base = r; break }
    cursor = r.parent ? backupIdPart(r.parent) : null
  }

  if (!base) {
    throw createError({
      statusCode: 409,
      message: 'Cannot restore this partial backup: its base full backup is missing.',
    })
  }

  updateJobProgress({ phase: 'db-consolidate', percent: 12 })
  const baseDump = await readDbDump(base.id)
  return consolidateDumps(baseDump, ownDump)
}

/** Reads and gunzips a snapshot's db.surql.gz into a Buffer. */
async function readDbDump(id: string): Promise<Buffer> {
  const backupDir = path.join(BACKUPS_ROOT, backupIdPart(id))
  const dbArchivePath = path.join(backupDir, 'db.surql.gz')
  const gz = await readFile(dbArchivePath)
  return gunzipSync(gz)
}

/**
 * Sanity-checks that the import populated the database. The export always
 * re-creates the schema, so an empty INFO FOR DB means the import failed even
 * if no statement reported an error.
 */
async function verifyRestore(): Promise<void> {
  const db = await useDb()
  const res = await queryDb<unknown[]>(db, 'INFO FOR DB;', undefined, {
    label: 'verify restore',
    timeoutMs: 20_000,
  })
  const entry = (Array.isArray(res) ? res[0] : res) as Record<string, unknown> | null
  const root = (entry && typeof entry === 'object' && 'result' in entry
    ? (entry as { result?: unknown }).result
    : entry) as Record<string, unknown> | null
  const tables = root?.tables
  const tableCount = tables && typeof tables === 'object' ? Object.keys(tables).length : 0
  if (tableCount === 0) {
    throw new Error('Restore verification failed: database has no tables after import.')
  }
}

async function regenerateVariantsBackground(): Promise<void> {
  const db = await useDb()
  const settings = await getMediaSettings()
  const res = await queryDb(
    db,
    'SELECT * FROM files WHERE is_image = true;',
    undefined,
    { label: 'variant regen list', timeoutMs: 30_000 }
  )
  const imageFiles = queryRows<Record<string, unknown>>(res).map(mediaNormalizeFileRecord)

  // Process in batches of 2 (matches 2-core budget)
  const CONCURRENCY = 2
  for (let i = 0; i < imageFiles.length; i += CONCURRENCY) {
    const batch = imageFiles.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (file) => {
        try {
          const uploadsRoot = path.resolve(process.cwd(), 'storage/uploads')
          if (!file.original_path) return
          const absPath = path.join(uploadsRoot, file.original_path)
          const buffer = await readFile(absPath)
          await mediaProcessImageBuffer(buffer, file.hash, file.mime_type, settings.enable_perceptual_dedup)
        } catch (err) {
          if (import.meta.dev) {
            console.warn(`[backup] Variant regen failed for ${file.hash}:`, (err as Error)?.message)
          }
        }
      })
    )
  }
}
