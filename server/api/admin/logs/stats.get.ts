import { requireAdmin } from '../../../utils/auth'
import { gatherLogStats } from '../../../utils/logging'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await gatherLogStats()
})
