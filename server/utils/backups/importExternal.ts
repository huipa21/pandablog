import { randomBytes } from 'node:crypto'
import { mkdir, open, rename, copyFile, rm, stat } from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
import { createBackupRecord, updateBackupRecord } from './registry'
import { acquireJob, releaseJob, writeDurableJson, type JobOwner } from './jobMutex'
import { sha256File } from './surrealHttp'
import { expandDump, BACKUP_LIMITS, regularFile } from './streams'
import { validateDumpByStaging } from './validate'
import { extractMediaTar, collectOriginalPaths } from './tarStream'
import { BACKUPS_ROOT } from './config'
import { verifyBackupMediaCatalog } from './media-validation'

export interface ExternalBackupFiles {dbGzPath: string, mediaTarGzPath: string, manifestBuffer?: Buffer | null}
const schema = z.object({
  type: z.literal('full').optional(), note: z.string().max(2000).nullable().optional(),
  sha256_db: z.string().regex(/^[a-f0-9]{64}$/).optional(), sha256_media: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  included_hashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(BACKUP_LIMITS.mediaEntries).optional(),
  media_file_count: z.number().int().min(0).max(BACKUP_LIMITS.mediaEntries).optional(),
  included_tables: z.null().optional(), excluded_tables: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).max(200).optional()
}).passthrough()
export function parseBackupManifest(buffer?: Buffer | null) {
  if (!buffer) return null
  if (buffer.length > BACKUP_LIMITS.manifestBytes) throw new Error('Backup manifest byte budget exceeded')
  const parsed = schema.safeParse(JSON.parse(buffer.toString('utf8')))
  if (!parsed.success) throw new Error('Unsupported or invalid backup manifest; external import requires a self-contained full snapshot')
  return parsed.data
}

/** Validate expansion/tar structure before ready publication, never just gzip
 * magic. SQL remains administrator-trusted executable input under ROOT. */
export async function importExternalBackup(files: ExternalBackupFiles, suppliedOwner?: JobOwner): Promise<string> {
  const owner = suppliedOwner ?? await acquireJob({id: `import_${randomBytes(12).toString('hex')}`, kind: 'import', startedAt: new Date().toISOString()})
  const id = owner.id, directory = path.join(BACKUPS_ROOT, id)
  let created = false, publishing = false
  try {
    const manifest = parseBackupManifest(files.manifestBuffer)
    await regularFile(files.dbGzPath, BACKUP_LIMITS.compressedBytes)
    await regularFile(files.mediaTarGzPath, BACKUP_LIMITS.mediaBytes)
    await mkdir(directory, {mode: 0o700})
    created = true
    const sql = path.join(directory, 'verify.surql'), mediaStage = path.join(directory, 'verify-media')
    await expandDump(files.dbGzPath, sql)
    const count = await extractMediaTar(files.mediaTarGzPath, mediaStage)
    await validateDumpByStaging(sql, stage => verifyBackupMediaCatalog(stage, mediaStage))
    const originals = await collectOriginalPaths(mediaStage)
    const hashes = originals.map(rel => path.basename(rel).split('.')[0]!)
    const dbSha = await sha256File(files.dbGzPath), mediaSha = await sha256File(files.mediaTarGzPath)
    if (manifest?.sha256_db && manifest.sha256_db !== dbSha || manifest?.sha256_media && manifest.sha256_media !== mediaSha || manifest?.media_file_count !== undefined && manifest.media_file_count !== count) throw new Error('Backup checksum/count mismatch')
    await createBackupRecord({id, type: 'full', note: manifest?.note ?? null, parent: null, chain_root: null, included_hashes: hashes})
    const dbPath = path.join(directory, 'db.surql.gz'), mediaPath = path.join(directory, 'media.tar.gz')
    await moveInto(files.dbGzPath, dbPath); await moveInto(files.mediaTarGzPath, mediaPath)
    for (const filePath of [dbPath, mediaPath]) {
      const file = await open(filePath, 'r+')
      try {await file.sync()} finally {await file.close()}
    }
    await writeDurableJson(path.join(directory, 'manifest.json'), {id, type: 'full', parent: null, chain_root: null, created_at: new Date().toISOString(), sha256_db: dbSha, sha256_media: mediaSha, media_file_count: count, included_hashes: hashes, included_tables: null, excluded_tables: manifest?.excluded_tables ?? []})
    await rm(sql); await rm(mediaStage, {recursive: true})
    publishing = true
    await updateBackupRecord(id, {status: 'ready', db_size_bytes: (await stat(dbPath)).size, media_size_bytes: (await stat(mediaPath)).size, media_file_count: count, manifest_sha256_db: dbSha, manifest_sha256_media: mediaSha, included_hashes: hashes, completed_at: new Date().toISOString()})
    return id
  } catch (error) {
    await updateBackupRecord(id, {status: 'failed', error: String(error).slice(0, 1000)}).catch(() => {})
    if (created && !publishing) await rm(directory, {recursive: true, force: true}).catch(() => {})
    throw error
  } finally {await releaseJob(owner)}
}
async function moveInto(source: string, target: string) {
  try {await rename(source, target)} catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    await copyFile(source, target); await rm(source)
  }
}
