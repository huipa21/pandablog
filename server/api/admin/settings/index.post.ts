import { requireAdminUser } from '../../../utils/auth'
import { filterPublicSettings, readAppSettings, writeAppSettings } from '../../../utils/settings'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const body = await readBody<Record<string, unknown>>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'Settings payload must be an object' })
  }

  await writeAppSettings(filterPublicSettings(body))
  return { ok: true, settings: await readAppSettings() }
})
