import { requireAdmin } from '../../../utils/auth'
import { listErrorLogs } from '../../../utils/logging-admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await listErrorLogs(event)
})
