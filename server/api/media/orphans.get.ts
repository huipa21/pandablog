import { requireContentManager } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { mediaListOrphanFiles } from '../../utils/mediaCleanup'

export default defineEventHandler(async (event) => {
  await requireContentManager(event)
  const query = getQuery(event)
  const olderThanDays = Number(query.older_than_days || 0)
  const db = await useDb()
  const files = await mediaListOrphanFiles(db, Number.isFinite(olderThanDays) ? olderThanDays : undefined)

  return {
    files,
    total: files.length
  }
})
