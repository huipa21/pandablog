import { getQuery } from 'h3'
import { requireSuperadmin } from '../../../utils/auth'
import { getAnalyticsTopPages, parseAnalyticsLimit, parseAnalyticsRange } from '../../../utils/analytics/read'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  const query = getQuery(event)
  return await getAnalyticsTopPages(parseAnalyticsRange(event), parseAnalyticsLimit(query.limit, 10, 50))
})
