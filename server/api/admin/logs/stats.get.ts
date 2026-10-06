import { requireSuperadmin } from '../../../utils/auth'
import { requestAbortSignal } from '../../../utils/request-abort'
import { gatherLogStats } from '../../../utils/logging'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return await gatherLogStats(requestAbortSignal(event))
})
