import { requireAdmin } from '../../../utils/auth'
import { runLoggingCleanup } from '../../../utils/logging'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const result = await runLoggingCleanup('manual')
  return { ok: true, result }
})
