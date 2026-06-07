import { requireSuperadmin } from '../../../utils/auth'
import { listActivityLogs } from '../../../utils/logging-admin'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return await listActivityLogs(event)
})
