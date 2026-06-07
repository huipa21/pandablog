import { requireSuperadmin } from '../../../utils/auth'
import { gatherLogStats } from '../../../utils/logging'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return await gatherLogStats()
})
