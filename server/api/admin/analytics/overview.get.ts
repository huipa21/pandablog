import { requireSuperadmin } from '../../../utils/auth'
import { getAnalyticsOverview, parseAnalyticsRange } from '../../../utils/analytics/read'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return await getAnalyticsOverview(parseAnalyticsRange(event))
})
