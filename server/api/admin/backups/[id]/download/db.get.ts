import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { gunzipSync, gzipSync } from 'node:zlib'
import * as path from 'node:path'
import { requireSuperadmin } from '../../../../../utils/auth'
import { getBackup, backupIdPart } from '../../../../../utils/backups/registry'
import { BACKUPS_ROOT } from '../../../../../utils/backups/config'
import { consolidateDumps } from '../../../../../utils/backups/validate'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  const id = getRouterParam(event, 'id') ?? ''

  const record = await getBackup(id)
  if (!record) {
    throw createError({ statusCode: 404, message: 'Backup snapshot not found' })
  }
  if (record.status !== 'ready') {
    throw createError({ statusCode: 409, message: 'Backup is not ready for download' })
  }

  const safePart = backupIdPart(id)
  const query = getQuery(event)
  const wantConsolidated = query.consolidated === '1' || query.consolidated === 'true'

  // For a partial backup, optionally return a self-contained full dump built by
  // merging the partial subset on top of its base full backup.
  if (wantConsolidated && record.type === 'partial') {
    if (!record.parent) {
      throw createError({ statusCode: 409, message: 'Partial backup has no base full backup to consolidate against.' })
    }
    const base = await getBackup(record.parent)
    if (!base) {
      throw createError({ statusCode: 409, message: 'Base full backup is missing; cannot consolidate.' })
    }
    const basePart = backupIdPart(base.id)
    const baseDump = gunzipSync(await readFile(path.join(BACKUPS_ROOT, basePart, 'db.surql.gz')))
    const partialDump = gunzipSync(await readFile(path.join(BACKUPS_ROOT, safePart, 'db.surql.gz')))
    const merged = await consolidateDumps(baseDump, partialDump)
    const gz = gzipSync(merged, { level: 6 })

    setHeader(event, 'content-type', 'application/gzip')
    setHeader(event, 'content-disposition', `attachment; filename="${safePart}-db-consolidated.surql.gz"`)
    return gz
  }

  const filePath = path.join(BACKUPS_ROOT, safePart, 'db.surql.gz')

  setHeader(event, 'content-type', 'application/gzip')
  setHeader(event, 'content-disposition', `attachment; filename="${safePart}-db.surql.gz"`)

  return sendStream(event, createReadStream(filePath))
})

