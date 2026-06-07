import { requireSuperadmin } from '../../../utils/auth'
import { parseLogType } from '../../../utils/logging-admin'
import { purgeLogType } from '../../../utils/logging'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)

  const { type } = getRouterParams(event)
  if (!type) {
    throw createError({ statusCode: 400, message: 'Missing log type' })
  }

  const safeType = parseLogType(type)
  const body = await readBody<{ confirm_token?: string }>(event)

  if (body.confirm_token !== `PURGE_${safeType.toUpperCase()}`) {
    throw createError({ statusCode: 400, message: 'Invalid confirmation token' })
  }

  const deleted = await purgeLogType(safeType)
  return { ok: true, deleted }
})
