import { requireAdmin } from '../../../../utils/auth'
import { resetLoggingSettings } from '../../../../utils/logging'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const settings = await resetLoggingSettings()
  return { ok: true, settings }
})
