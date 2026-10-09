import { randomBytes } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import * as path from 'node:path'
import { createError } from 'h3'
import { BACKUPS_ROOT } from './config'
import { createBackupRecord, pruneBackups, updateBackupRecord } from './registry'
import { acquireJob, releaseJob, updateJobProgress, writeDurableJson, type JobOwner } from './jobMutex'
import { writeBarrier } from '../maintenance'
import { BACKUP_LIMITS, streamToFile } from './streams'
import { exportSurrealDb, sha256File } from './surrealHttp'
import { collectOriginalPaths, createMediaTar } from './tarStream'
import { getBackupSettings } from '../settings'
import { useDb } from '../db'
import { assertMediaSnapshotReady, mediaPublicationAdmission } from '../media-publication'
import { createBackupSchema } from './contracts'
import { manifestSchema } from './manifest'
import { packBundle } from './bundle'
import { publishReadyBackup } from './publication'

export interface CreateBackupOptions {type?: 'full', note?: string | null}

/** Reject retired modes/unknown fields before admission or persistent effects. */
export async function startBackupJob(options: CreateBackupOptions): Promise<string> {
  const parsed = createBackupSchema.safeParse(options)
  if (!parsed.success) throw createError({statusCode: 400, message: 'Full backups accept only an optional note and literal full type'})
  const id = generateBackupId()
  const owner = await acquireJob({id, kind: 'create', startedAt: new Date().toISOString()})
  try {
    const record = await createBackupRecord({id, type: 'full', note: parsed.data.note ?? null, parent: null, chain_root: null, included_hashes: [], included_tables: null})
    void writeBarrier.run(() => runBackupWork(owner, id, parsed.data.note ?? null, record.created_at), true).catch(() => {})
    return id
  } catch (error) {await releaseJob(owner); throw error}
}

async function runBackupWork(owner: JobOwner, id: string, note: string | null, createdAt: string): Promise<void> {
  let created = false, publishing = false
  let releaseMedia: (() => void) | undefined
  const backupDir = path.join(BACKUPS_ROOT, id)
  try {
    releaseMedia = await mediaPublicationAdmission.acquire()
    await assertMediaSnapshotReady(await useDb())
    await mkdir(backupDir, {mode: 0o700}); created = true
    updateJobProgress({phase: 'preparing', percent: 2})
    updateJobProgress({phase: 'db-export', percent: 5})
    const dbOutPath = path.join(backupDir, 'db.surql.gz')
    await streamToFile(await exportSurrealDb(), `${dbOutPath}.part`, {gzip: true, maxBytes: BACKUP_LIMITS.compressedBytes})
    await rename(`${dbOutPath}.part`, dbOutPath)
    const dbStat = await stat(dbOutPath), dbSha256 = await sha256File(dbOutPath)
    updateJobProgress({phase: 'media-collect', percent: 40})
    const uploadsRoot = path.resolve(process.cwd(), 'storage/uploads')
    const originals = await collectOriginalPaths(uploadsRoot)
    const mediaOutPath = path.join(backupDir, 'media.tar.gz')
    await createMediaTar(originals, uploadsRoot, `${mediaOutPath}.part`, 1, (processed, total) => {
      updateJobProgress({phase: 'media-pack', percent: 45 + (total ? processed / total : 1) * 40, detail: `${processed} / ${total}`})
    })
    await rename(`${mediaOutPath}.part`, mediaOutPath)
    const mediaStat = await stat(mediaOutPath), mediaSha256 = await sha256File(mediaOutPath)
    const hashes = originals.map(rel => path.basename(rel).replace(/\.[^.]+$/, ''))
    const manifest = manifestSchema.parse({
      format: 'pandablog-backup', format_version: 1, id, type: 'full', parent: null, chain_root: null, included_tables: null,
      created_at: createdAt, note, sha256_db: dbSha256, sha256_media: mediaSha256,
      db_size_bytes: dbStat.size, media_size_bytes: mediaStat.size, media_file_count: originals.length, included_hashes: hashes, excluded_tables: [],
    })
    await writeDurableJson(path.join(backupDir, 'manifest.json'), manifest)
    updateJobProgress({phase: 'bundle-pack', percent: 88})
    const bundle = await packBundle(backupDir)
    updateJobProgress({phase: 'finalize', percent: 95})
    // A lost response may already have published ready. Never overwrite/delete
    // that generation in the catch path; preserve exact artifacts for inspection.
    publishing = true
    await publishReadyBackup(id, {
      ...bundle, status: 'ready', included_hashes: hashes,
      db_size_bytes: dbStat.size, media_size_bytes: mediaStat.size, media_file_count: originals.length,
      manifest_sha256_db: dbSha256, manifest_sha256_media: mediaSha256, completed_at: new Date().toISOString(),
    })
    try {
      const settings = await getBackupSettings()
      if (settings.max_backups > 0) await pruneBackups(settings.max_backups)
    } catch {console.warn('[backup] retention did not complete; existing snapshots preserved')}
  } catch (error) {
    if (!publishing) {
      await updateBackupRecord(id, {status: 'failed', error: error instanceof Error ? error.message.slice(0, 1000) : 'Backup failed', completed_at: new Date().toISOString()}).catch(() => {})
      if (created) await rm(backupDir, {recursive: true, force: true, maxRetries: 3, retryDelay: 50}).catch(() => {console.warn('[backup] unpublished cleanup incomplete; owned artifacts preserved')})
    } else console.warn('[backup] ready publication uncertain; completed artifacts preserved')
  } finally {releaseMedia?.(); await releaseJob(owner)}
}

function generateBackupId(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + randomBytes(12).toString('hex')
}
