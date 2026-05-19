import { getSiteVisibility } from '../../utils/visibility'

export default defineEventHandler(async () => {
  return { mode: await getSiteVisibility() }
})
