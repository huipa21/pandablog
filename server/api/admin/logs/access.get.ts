import { requireSuperadmin } from '../../../utils/auth'
import { listAccessLogs } from '../../../utils/logging-admin'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return await listAccessLogs(event)
})
