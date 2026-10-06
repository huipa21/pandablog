import { sendBackupFile } from '../../../../../utils/backups/download'
import { BACKUP_LIMITS } from '../../../../../utils/backups/streams'
import * as path from 'node:path'
import { requireSuperadmin } from '../../../../../utils/auth'
import { getBackup, backupIdPart } from '../../../../../utils/backups/registry'
import { BACKUPS_ROOT } from '../../../../../utils/backups/config'

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
  const filePath = path.join(BACKUPS_ROOT, safePart, 'media.tar.gz')

  return sendBackupFile(event, filePath, `${safePart}-media.tar.gz`, BACKUP_LIMITS.mediaBytes)
})
