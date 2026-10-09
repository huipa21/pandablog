import { link, mkdir, rm, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUPS_ROOT, type BackupRecord } from './config'
import { backupIdPart, getBackup, updateBackupRecord } from './registry'
import { acquireJob, releaseJob, syncDirectory, writeDurableJson, updateJobProgress } from './jobMutex'
import { packBundle, unpackBundle, hashFile } from './bundle'
import { manifestSchema, manifestNote } from './manifest'
import { verifyFullComponents, verifyReadyBundle } from './snapshot'
import { collectOriginalPaths, extractMediaTar } from './tarStream'
import { checkDisk } from './streams'
import { assertSupportedFull } from './contracts'

/** Called with a snapshot read lease. Existing inner bytes/identity never change. */
export async function ensureBundle(record: BackupRecord): Promise<string> {
  assertSupportedFull(record)
  const root = join(BACKUPS_ROOT, backupIdPart(record.id))
  if (record.bundle_filename) return verifyReadyBundle(record, root)
  const owner = await acquireJob({id: record.id, kind: 'package', startedAt: new Date().toISOString()})
  const stage = join(BACKUPS_ROOT, `.package-${owner.token}`)
  let created = false
  try {
    const current = await getBackup(record.id)
    if (!current || current.status !== 'ready') throw new Error('Backup snapshot is not ready')
    if (current.bundle_filename) return verifyReadyBundle(current, root)
    const components = await verifyFullComponents(current, root)
    await checkDisk(root, (components.dbBytes + components.mediaBytes) * 2)
    await mkdir(stage, {mode: 0o700}); created = true
    updateJobProgress({phase: 'bundle-pack', percent: 5})
    const mediaStage = join(stage, 'verify-media')
    const count = await extractMediaTar(components.media, mediaStage)
    const hashes = (await collectOriginalPaths(mediaStage)).map(rel => rel.split('/').at(-1)!.split('.')[0]!)
    if (count !== current.media_file_count || JSON.stringify([...hashes].sort()) !== JSON.stringify([...current.included_hashes].sort())) throw new Error('Legacy media catalog mismatch')
    await rm(mediaStage, {recursive: true})
    const manifest = manifestSchema.parse({
      format: 'pandablog-backup', format_version: 1, id: backupIdPart(current.id), type: 'full', parent: null, chain_root: null, included_tables: null,
      created_at: current.created_at, ...manifestNote(current.note), sha256_db: current.manifest_sha256_db, sha256_media: current.manifest_sha256_media,
      db_size_bytes: components.dbBytes, media_size_bytes: components.mediaBytes, media_file_count: count, included_hashes: hashes, excluded_tables: components.manifest.excluded_tables ?? [],
    })
    await link(components.db, join(stage, 'db.surql.gz')); await link(components.media, join(stage, 'media.tar.gz'))
    await writeDurableJson(join(stage, 'manifest.json'), manifest)
    const target = join(root, 'backup.tar.gz')
    let exists = false
    try {await lstat(target); exists = true} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error}
    let metadata
    if (exists) {
      // Reconcile an exact previously published bundle after a lost DB reply,
      // never overwrite an unfamiliar target or delete legacy components.
      const unpacked = await unpackBundle(target, join(stage, 'reconcile'))
      if (JSON.stringify(JSON.parse(unpacked.manifestBuffer.toString())) !== JSON.stringify(manifest)) throw new Error('Unrecognized published bundle; offline reconciliation required')
      metadata = {format_version: 1, bundle_filename: 'backup.tar.gz', bundle_size_bytes: (await lstat(target)).size, bundle_sha256: await hashFile(target)}
    } else {
      metadata = await packBundle(stage)
      await link(join(stage, 'backup.tar.gz'), target)
      await syncDirectory(root)
    }
    await updateBackupRecord(current.id, metadata)
    return target
  } finally {
    if (created) await rm(stage, {recursive: true, force: true})
    await releaseJob(owner)
  }
}
