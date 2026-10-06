import { lstat, open } from 'node:fs/promises'
import * as path from 'node:path'
import { closeRootClient, connectRootClient } from '../db'
import { assertMediaStorageCompatible } from '../media-storage-migration'
import { collectOriginalPaths, ORIGINAL_PATH } from './tarStream'
import { regularFile, BACKUP_LIMITS } from './streams'
import { runSqlHttp, sha256File } from './surrealHttp'
import { syncDirectory } from './jobMutex'

export async function verifyBackupMediaCatalog(database: string, mediaRoot: string) {
  // Every staged original (including orphans) is checked and synced before a
  // destructive journal boundary. File names alone are not integrity proof.
  const originals = await collectOriginalPaths(mediaRoot)
  const directories = new Set<string>([mediaRoot])
  for (const rel of originals) {
    const filePath = path.join(mediaRoot, rel)
    if (await sha256File(filePath) !== path.basename(rel).split('.')[0]) throw new Error('Original media checksum mismatch')
    const file = await open(filePath, 'r+')
    try {await file.sync()} finally {await file.close()}
    directories.add(path.dirname(filePath)); directories.add(path.dirname(path.dirname(filePath)))
  }
  for (const directory of directories) await syncDirectory(directory)
  const config = useRuntimeConfig(), db = await connectRootClient()
  try {await db.use({namespace: config.surrealNamespace, database}); await assertMediaStorageCompatible(db)} finally {await closeRootClient(db)}
  let offset = 0
  while (true) {
    const response = await runSqlHttp(`SELECT id, hash, original_path FROM files WITH NOINDEX ORDER BY id LIMIT 100 START ${offset};`, database)
    const rows = (response as {result: {hash: string, original_path: string}[]}[])[0]?.result ?? []
    if (!rows.length) break
    offset += rows.length
    if (offset > BACKUP_LIMITS.mediaEntries) throw new Error('Media catalog entry limit')
    for (const file of rows) {
      if (!ORIGINAL_PATH.test(file.original_path) || path.basename(file.original_path).split('.')[0] !== file.hash) throw new Error('Invalid restored original path/hash')
      await regularFile(path.join(mediaRoot, file.original_path), BACKUP_LIMITS.mediaBytes)
    }
  }
}
export async function assertSameMediaFilesystem(stage: string, uploads: string, variants: string) {
  const source = await lstat(stage)
  for (const directory of [uploads, variants]) {
    const live = await lstat(directory)
    if (!live.isDirectory() || live.dev !== source.dev) throw new Error('Restore media/safety directories must be regular directories on the same filesystem')
  }
}
