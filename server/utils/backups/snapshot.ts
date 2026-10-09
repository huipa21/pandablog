import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BackupRecord } from './config'
import { assertSupportedFull } from './contracts'
import { BACKUP_LIMITS, regularFile } from './streams'
import { BUNDLE_LIMITS, hashFile } from './bundle'
import { parseManifest } from './manifest'

/** Shared full-only component check; does not execute SQL or modify artifacts. */
export async function verifyFullComponents(record: BackupRecord, root: string) {
  assertSupportedFull(record)
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe backup directory')
  const db = join(root, 'db.surql.gz'), media = join(root, 'media.tar.gz'), file = join(root, 'manifest.json')
  const dbBytes = await regularFile(db, BACKUP_LIMITS.compressedBytes), mediaBytes = await regularFile(media, BACKUP_LIMITS.mediaBytes)
  await regularFile(file, BACKUP_LIMITS.manifestBytes)
  const manifest = parseManifest(await readFile(file))
  if (!record.manifest_sha256_db || !record.manifest_sha256_media || manifest.sha256_db !== record.manifest_sha256_db || manifest.sha256_media !== record.manifest_sha256_media || await hashFile(db) !== record.manifest_sha256_db || await hashFile(media) !== record.manifest_sha256_media || record.db_size_bytes !== dbBytes || record.media_size_bytes !== mediaBytes || manifest.media_file_count !== record.media_file_count || (manifest.db_size_bytes !== undefined && manifest.db_size_bytes !== dbBytes) || (manifest.media_size_bytes !== undefined && manifest.media_size_bytes !== mediaBytes)) throw new Error('Backup manifest/component integrity mismatch')
  return {manifest, db, media, dbBytes, mediaBytes}
}
export async function verifyReadyBundle(record: BackupRecord, root: string) {
  assertSupportedFull(record)
  const directory = await lstat(root)
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Unsafe backup directory')
  if (record.format_version !== 1 || record.bundle_filename !== 'backup.tar.gz' || !record.bundle_size_bytes || !record.bundle_sha256) throw new Error('Backup bundle metadata is incomplete')
  const file = join(root, 'backup.tar.gz')
  if (await regularFile(file, BUNDLE_LIMITS.encodedBytes) !== record.bundle_size_bytes || await hashFile(file) !== record.bundle_sha256) throw new Error('Backup bundle integrity mismatch')
  return file
}
