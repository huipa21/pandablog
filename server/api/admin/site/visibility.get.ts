import { requireAdminUser } from '../../../utils/auth'
import { getSiteVisibility } from '../../../utils/visibility'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  return { mode: await getSiteVisibility() }
})
