import { randomBytes } from 'node:crypto'
import { mkdir, open, rename, copyFile, rm, stat, constants } from 'node:fs/promises'
import * as path from 'node:path'
import { createBackupRecord, updateBackupRecord } from './registry'
import { acquireJob, releaseJob, writeDurableJson, updateJobProgress, type JobOwner } from './jobMutex'
import { sha256File } from './surrealHttp'
import { expandDump, BACKUP_LIMITS, regularFile, checkDisk } from './streams'
import { validateDumpByStaging } from './validate'
import { extractMediaTar, collectOriginalPaths } from './tarStream'
import { BACKUPS_ROOT } from './config'
import { verifyBackupMediaCatalog } from './media-validation'
import { parseManifest, manifestSchema, manifestNote } from './manifest'
import { packBundle, unpackBundle } from './bundle'
import { publishReadyBackup } from './publication'

export interface ExternalBackupFiles {dbGzPath: string, mediaTarGzPath: string, manifestBuffer?: Buffer | null, backupGzPath?: string}
export function parseBackupManifest(buffer?: Buffer | null) {return buffer ? parseManifest(buffer) : null}

/** SQL remains administrator-trusted executable input under explicit ROOT.
 * Import registers a new full snapshot; it never restores the live database. */
export async function importExternalBackup(input: ExternalBackupFiles, suppliedOwner?: JobOwner): Promise<string> {
  const owner = suppliedOwner ?? await acquireJob({id: `import_${randomBytes(12).toString('hex')}`, kind: 'import', startedAt: new Date().toISOString()})
  const id = owner.id, directory = path.join(BACKUPS_ROOT, id)
  let created = false, publishing = false, registered = false
  try {
    await mkdir(directory, {mode: 0o700}); created = true
    const files = input.backupGzPath ? await unpackBundle(input.backupGzPath, path.join(directory, 'unpacked')) : input
    const manifest = parseBackupManifest(files.manifestBuffer)
    const dbSize = await regularFile(files.dbGzPath, BACKUP_LIMITS.compressedBytes), mediaSize = await regularFile(files.mediaTarGzPath, BACKUP_LIMITS.mediaBytes)
    await checkDisk(directory, (dbSize + mediaSize) * 2 + BACKUP_LIMITS.sqlBytes)
    const sql = path.join(directory, 'verify.surql'), mediaStage = path.join(directory, 'verify-media')
    await expandDump(files.dbGzPath, sql)
    const count = await extractMediaTar(files.mediaTarGzPath, mediaStage)
    await validateDumpByStaging(sql, stage => verifyBackupMediaCatalog(stage, mediaStage))
    const originals = await collectOriginalPaths(mediaStage), hashes = originals.map(rel => path.basename(rel).split('.')[0]!)
    const dbSha = await sha256File(files.dbGzPath), mediaSha = await sha256File(files.mediaTarGzPath)
    if (manifest?.sha256_db && manifest.sha256_db !== dbSha || manifest?.sha256_media && manifest.sha256_media !== mediaSha || manifest?.media_file_count !== undefined && manifest.media_file_count !== count || manifest?.db_size_bytes !== undefined && manifest.db_size_bytes !== dbSize || manifest?.media_size_bytes !== undefined && manifest.media_size_bytes !== mediaSize || manifest?.included_hashes && JSON.stringify([...manifest.included_hashes].sort()) !== JSON.stringify([...hashes].sort())) throw new Error('Backup checksum/size/count/catalog mismatch')
    const note = manifest?.note ?? manifest?.source_note ?? null
    const record = await createBackupRecord({id, type: 'full', note, parent: null, chain_root: null, included_hashes: hashes})
    registered = true
    const dbPath = path.join(directory, 'db.surql.gz'), mediaPath = path.join(directory, 'media.tar.gz')
    await moveInto(files.dbGzPath, dbPath); await moveInto(files.mediaTarGzPath, mediaPath)
    for (const filePath of [dbPath, mediaPath]) {
      const file = await open(filePath, 'r+')
      try {await file.sync()} finally {await file.close()}
    }
    await writeDurableJson(path.join(directory, 'manifest.json'), manifestSchema.parse({
      format: 'pandablog-backup', format_version: 1, id, ...(manifest?.id ? {source_id: manifest.id} : {}), type: 'full', parent: null, chain_root: null, included_tables: null,
      created_at: record.created_at, ...manifestNote(note), sha256_db: dbSha, sha256_media: mediaSha, db_size_bytes: dbSize, media_size_bytes: mediaSize,
      media_file_count: count, included_hashes: hashes, excluded_tables: manifest?.excluded_tables ?? [],
    }))
    await rm(sql); await rm(mediaStage, {recursive: true})
    if (input.backupGzPath) await rm(path.join(directory, 'unpacked'), {recursive: true})
    updateJobProgress({phase: 'bundle-pack', percent: 90})
    const bundle = await packBundle(directory)
    publishing = true
    await publishReadyBackup(id, {...bundle, status: 'ready', db_size_bytes: (await stat(dbPath)).size, media_size_bytes: (await stat(mediaPath)).size, media_file_count: count, manifest_sha256_db: dbSha, manifest_sha256_media: mediaSha, included_hashes: hashes, completed_at: new Date().toISOString()})
    return id
  } catch (error) {
    if (!publishing) {
      if (registered) await updateBackupRecord(id, {status: 'failed', error: error instanceof Error ? error.message.slice(0, 1000) : 'Backup import failed'}).catch(() => {})
      if (created) await rm(directory, {recursive: true, force: true}).catch(() => {})
    }
    // Ambiguous publication preserves components/bundle and the existing row.
    throw error
  } finally {await releaseJob(owner)}
}
async function moveInto(source: string, target: string) {
  try {await rename(source, target)} catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await copyFile(source, target, constants.COPYFILE_EXCL); await rm(source)
  }
}
