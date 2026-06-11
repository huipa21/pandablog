import { rm } from 'node:fs/promises'
import * as path from 'node:path'
import { requireSuperadmin } from '../../../utils/auth'
import { getBackup, deleteBackupRecord, getDirectDescendants, backupIdPart } from '../../../utils/backups/registry'
import { BACKUPS_ROOT } from '../../../utils/backups/config'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ confirm_token?: string, cascade?: boolean }>(event)

  if (body.confirm_token !== `DELETE_${id}`) {
    throw createError({ statusCode: 400, message: 'Invalid confirmation token. Expected DELETE_<id>.' })
  }

  const record = await getBackup(id)
  if (!record) {
    throw createError({ statusCode: 404, message: 'Backup snapshot not found' })
  }

  const descendants = await getDirectDescendants(id)
  if (descendants.length > 0 && !body.cascade) {
    throw createError({
      statusCode: 409,
      message: `This snapshot has ${descendants.length} dependent backup(s). Pass cascade: true to delete them too.`,
    })
  }

  // Delete descendants first (cascade)
  if (body.cascade) {
    for (const desc of descendants) {
      await deleteSnapshotFiles(desc.id)
      await deleteBackupRecord(desc.id)
    }
  }

  await deleteSnapshotFiles(id)
  await deleteBackupRecord(id)

  return { ok: true }
})

async function deleteSnapshotFiles(id: string): Promise<void> {
  const dir = path.join(BACKUPS_ROOT, backupIdPart(id))
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}
