import { requireSuperadmin } from '../../../utils/auth'
import { listErrorLogs } from '../../../utils/logging-admin'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return await listErrorLogs(event)
})
