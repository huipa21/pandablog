import { requireContentManager } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { mediaCleanupOrphanFiles } from '../../../utils/mediaCleanup'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)
  const body = await readBody<Record<string, unknown>>(event)
  const olderThanDays = typeof body.older_than_days === 'number' ? body.older_than_days : undefined
  const db = await useDb()

  return await mediaCleanupOrphanFiles(db, {
    olderThanDays,
    user,
    hashes: Array.isArray(body.hashes) ? body.hashes.filter((item): item is string => typeof item === 'string') : undefined
  })
})
