import { z } from 'zod'
import { requireSuperadmin } from '../../../utils/auth'
import { listBackups, deleteBackupRecord, deleteSnapshotFiles, backupIdPart } from '../../../utils/backups/registry'
import { acquireJob, releaseJob } from '../../../utils/backups/jobMutex'
import { readBoundedJson } from '../../../utils/bounded-json'

const schema = z.object({confirm_token: z.string().max(128), cascade: z.boolean().optional()}).strict()

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  const id = getRouterParam(event, 'id') ?? '', part = backupIdPart(id)
  const body = schema.safeParse(await readBoundedJson(event, 8 * 1024))
  if (!body.success || body.data.confirm_token !== `DELETE_${id}`) throw createError({statusCode: 400, message: 'Invalid backup deletion confirmation'})
  // No file deletion can race a create/import/consolidation/restore worker.
  const owner = await acquireJob({id, kind: 'delete', startedAt: new Date().toISOString()})
  try {
    const records = await listBackups()
    if (!records.some(record => backupIdPart(record.id) === part)) throw createError({statusCode: 404, message: 'Backup snapshot not found'})
    const ordered: string[] = [], visited = new Set<string>(), visiting = new Set<string>()
    const walk = (key: string) => {
      if (visiting.has(key)) throw createError({statusCode: 409, message: 'Backup ancestry cycle requires offline recovery'})
      if (visited.has(key)) return
      visiting.add(key)
      for (const record of records) if (record.parent && backupIdPart(record.parent) === key) walk(backupIdPart(record.id))
      visiting.delete(key); visited.add(key); ordered.push(key)
    }
    walk(part) // bounded history, complete descendants before any unlink
    if (ordered.length > 1 && !body.data.cascade) throw createError({statusCode: 409, message: 'Dependent backups require cascade deletion'})
    for (const key of ordered) {await deleteSnapshotFiles(key); await deleteBackupRecord(key)}
    return {ok: true}
  } finally {await releaseJob(owner)}
})
