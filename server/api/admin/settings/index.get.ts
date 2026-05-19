import { requireAdminUser } from '../../../utils/auth'
import { readAppSettings } from '../../../utils/settings'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  return { settings: await readAppSettings() }
})
