import { open, mkdir, writeFile, rename, copyFile, rm, stat } from 'node:fs/promises'
import * as path from 'node:path'
import { createBackupRecord, updateBackupRecord } from './registry'
import { acquireJob, releaseJob } from './jobMutex'
import { sha256File } from './surrealHttp'
import { BACKUPS_ROOT } from './config'

export interface ExternalBackupFiles {
  /** Path to the already-streamed gzipped DB dump on disk. */
  dbGzPath: string
  /** Path to the already-streamed gzipped media tar on disk. */
  mediaTarGzPath: string
  manifestBuffer?: Buffer | null
}

/**
 * Registers an externally-uploaded backup as a new full snapshot.
 * The archives are streamed to disk by the caller; this validates them
 * (gzip magic header + optional SHA-256 from manifest) and moves them into
 * the backup directory without buffering their contents in memory.
 */
export async function importExternalBackup(files: ExternalBackupFiles): Promise<string> {
  await validateGzipMagicFile(files.dbGzPath, 'db.surql.gz')
  await validateGzipMagicFile(files.mediaTarGzPath, 'media.tar.gz')

  let manifestData: Record<string, unknown> | null = null
  if (files.manifestBuffer?.length) {
    try {
      manifestData = JSON.parse(files.manifestBuffer.toString('utf8'))
    } catch {
      throw createError({ statusCode: 400, message: 'manifest.json is not valid JSON' })
    }
  }

  const id = generateImportId()

  await acquireJob({ id, kind: 'import', startedAt: new Date().toISOString() })

  try {
    await createBackupRecord({
      id,
      type: 'full',
      note: (manifestData?.note as string) ?? null,
      parent: null,
      chain_root: null,
      included_hashes: Array.isArray(manifestData?.included_hashes)
        ? (manifestData!.included_hashes as string[])
        : [],
    })

    const backupDir = path.join(BACKUPS_ROOT, id)
    await mkdir(backupDir, { recursive: true })

    const dbPath = path.join(backupDir, 'db.surql.gz')
    const mediaPath = path.join(backupDir, 'media.tar.gz')

    await moveInto(files.dbGzPath, dbPath)
    await moveInto(files.mediaTarGzPath, mediaPath)

    const dbSize = (await stat(dbPath)).size
    const mediaSize = (await stat(mediaPath)).size

    const dbSha256 = await sha256File(dbPath)
    const mediaSha256 = await sha256File(mediaPath)

    // Validate SHA-256 if manifest provided them
    if (manifestData?.sha256_db && manifestData.sha256_db !== dbSha256) {
      throw createError({ statusCode: 400, message: 'db.surql.gz SHA-256 does not match manifest' })
    }
    if (manifestData?.sha256_media && manifestData.sha256_media !== mediaSha256) {
      throw createError({ statusCode: 400, message: 'media.tar.gz SHA-256 does not match manifest' })
    }

    // Write our own manifest
    const manifest = {
      id,
      type: 'full',
      parent: null,
      chain_root: null,
      created_at: new Date().toISOString(),
      sha256_db: dbSha256,
      sha256_media: mediaSha256,
      media_file_count: Number(manifestData?.media_file_count ?? 0),
      included_hashes: Array.isArray(manifestData?.included_hashes)
        ? manifestData!.included_hashes
        : [],
    }
    await writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

    await updateBackupRecord(id, {
      status: 'ready',
      db_size_bytes: dbSize,
      media_size_bytes: mediaSize,
      media_file_count: Number(manifestData?.media_file_count ?? 0),
      manifest_sha256_db: dbSha256,
      manifest_sha256_media: mediaSha256,
      included_hashes: Array.isArray(manifestData?.included_hashes)
        ? (manifestData!.included_hashes as string[])
        : [],
      completed_at: new Date().toISOString(),
    })

    return id
  } catch (error) {
    await updateBackupRecord(id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      completed_at: new Date().toISOString(),
    }).catch(() => {})

    const backupDir = path.join(BACKUPS_ROOT, id)
    await rm(backupDir, { recursive: true, force: true }).catch(() => {})

    throw error
  } finally {
    await releaseJob()
  }
}

/**
 * Moves a file into place, falling back to copy+delete when the source and
 * destination live on different filesystems (rename throws EXDEV).
 */
async function moveInto(srcPath: string, destPath: string): Promise<void> {
  try {
    await rename(srcPath, destPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'EXDEV') {
      await copyFile(srcPath, destPath)
      await rm(srcPath, { force: true }).catch(() => {})
      return
    }
    throw err
  }
}

async function validateGzipMagicFile(filePath: string, name: string): Promise<void> {
  // gzip magic bytes: 0x1f 0x8b
  const fh = await open(filePath, 'r')
  try {
    const buf = Buffer.alloc(2)
    const { bytesRead } = await fh.read(buf, 0, 2, 0)
    if (bytesRead < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) {
      throw createError({ statusCode: 400, message: `${name} does not appear to be a valid gzip file` })
    }
  } finally {
    await fh.close()
  }
}

function generateImportId(): string {
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
  return `import_${ts}${rand}`
}
