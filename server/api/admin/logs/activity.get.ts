import { requireAdmin } from '../../../utils/auth'
import { listActivityLogs } from '../../../utils/logging-admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await listActivityLogs(event)
})
