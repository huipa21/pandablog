import { requireSuperadmin } from '../../../utils/auth'
import { getBackupSettings } from '../../../utils/settings'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  const settings = await getBackupSettings()
  return { settings }
})
