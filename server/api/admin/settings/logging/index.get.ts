import { requireSuperadmin } from '../../../../utils/auth'
import { getLoggingSettings, initializeLoggingSettings } from '../../../../utils/logging'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  await initializeLoggingSettings()
  return { settings: getLoggingSettings() }
})
