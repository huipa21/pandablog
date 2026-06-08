import { requireSuperadmin } from '../../../utils/auth'
import { listLogs } from '../../../utils/logging-admin'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return await listLogs(event, 'errors')
})
