import { requireSuperadmin } from '../../../../utils/auth'
import { resetLoggingSettings } from '../../../../utils/logging'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  const settings = await resetLoggingSettings()
  return { ok: true, settings }
})
