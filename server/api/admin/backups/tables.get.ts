import { requireSuperadmin } from '../../../utils/auth'
import { listDatabaseTables } from '../../../utils/backups/registry'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  const tables = await listDatabaseTables()
  return { tables }
})
