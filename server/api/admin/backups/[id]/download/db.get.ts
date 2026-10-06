import { createReadStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { requireSuperadmin } from '../../../../../utils/auth'
import { getBackup, backupIdPart } from '../../../../../utils/backups/registry'
import { BACKUPS_ROOT } from '../../../../../utils/backups/config'
import { consolidateDumps } from '../../../../../utils/backups/validate'
import { acquireJob, releaseJob } from '../../../../../utils/backups/jobMutex'
import { BACKUP_LIMITS, expandDump, streamToFile } from '../../../../../utils/backups/streams'
import { sha256File } from '../../../../../utils/backups/surrealHttp'
import { sendBackupFile } from '../../../../../utils/backups/download'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  const id = getRouterParam(event, 'id') ?? '', part = backupIdPart(id)
  const record = await getBackup(id)
  if (!record || record.status !== 'ready') throw createError({statusCode: 409, message: 'Backup snapshot is missing or not ready'})
  const archive = path.join(BACKUPS_ROOT, part, 'db.surql.gz'), query = getQuery(event)
  if (record.type !== 'partial' || !['1', 'true'].includes(String(query.consolidated))) return sendBackupFile(event, archive, `${part}-db.surql.gz`)
  const owner = await acquireJob({id, kind: 'consolidate', startedAt: new Date().toISOString()})
  const directory = path.join(BACKUPS_ROOT, `.download-${owner.token}`)
  try {
    const base = record.parent ? await getBackup(record.parent) : null
    if (!base || base.type !== 'full' || base.status !== 'ready' || !record.included_tables) throw new Error('Partial snapshot has no supported full base/table selection')
    const baseArchive = path.join(BACKUPS_ROOT, backupIdPart(base.id), 'db.surql.gz')
    if (!base.manifest_sha256_db || !record.manifest_sha256_db || await sha256File(baseArchive) !== base.manifest_sha256_db || await sha256File(archive) !== record.manifest_sha256_db) throw new Error('Backup DB checksum mismatch')
    await mkdir(directory, {mode: 0o700})
    const baseSql = path.join(directory, 'base.surql'), partialSql = path.join(directory, 'partial.surql'), merged = path.join(directory, 'merged.surql'), output = path.join(directory, 'db.surql.gz')
    await expandDump(baseArchive, baseSql); await expandDump(archive, partialSql)
    await consolidateDumps(baseSql, partialSql, record.included_tables, merged)
    await streamToFile(createReadStream(merged), output, {gzip: true, maxBytes: BACKUP_LIMITS.compressedBytes})
    await sendBackupFile(event, output, `${part}-db-consolidated.surql.gz`)
  } finally {await rm(directory, {recursive: true, force: true}); await releaseJob(owner)}
})
