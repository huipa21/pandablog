import { requireSuperadmin } from '../../../utils/auth'
import { getSiteVisibility } from '../../../utils/visibility'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  return { mode: await getSiteVisibility() }
})
