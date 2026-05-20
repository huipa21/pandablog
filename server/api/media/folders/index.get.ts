import { requireAdminUser } from '../../../utils/auth'
import { queryDb, useDb } from '../../../utils/db'
import { mediaNormalizeFolderRecord } from '../../../utils/mediaLibrary'
import { queryRows } from '../../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM folder ORDER BY name ASC;')

  return {
    folders: queryRows<Record<string, unknown>>(response).map(mediaNormalizeFolderRecord)
  }
})
