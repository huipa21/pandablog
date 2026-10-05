import { requireSuperadmin } from '../../../utils/auth'
import { getLastRetentionReport, LOG_RETENTION_SCHEDULE } from '../../../utils/log-retention'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return { last: getLastRetentionReport(), schedule: LOG_RETENTION_SCHEDULE }
})
