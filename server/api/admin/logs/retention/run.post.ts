import { requireSuperadmin } from '../../../../utils/auth'
import { runLogRetention } from '../../../../utils/log-retention'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return runLogRetention()
})
