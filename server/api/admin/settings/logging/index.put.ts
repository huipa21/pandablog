import { requireAdmin } from '../../../../utils/auth'
import { updateLoggingSettings } from '../../../../utils/logging'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<Record<string, unknown>>(event)
  const settings = await updateLoggingSettings(body)
  return { ok: true, settings }
})
