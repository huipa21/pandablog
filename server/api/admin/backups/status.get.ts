import { requireSuperadmin } from '../../../utils/auth'
import { getActiveJob } from '../../../utils/backups/jobMutex'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return { activeJob: getActiveJob() }
})
