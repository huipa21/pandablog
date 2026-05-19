import { requireAdmin } from '../../../../utils/auth'
import { getLoggingSettings, initializeLoggingSettings } from '../../../../utils/logging'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  await initializeLoggingSettings()
  return { settings: getLoggingSettings() }
})
