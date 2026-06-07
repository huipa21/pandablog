import { requireSuperadmin } from '../../../utils/auth'
import { installThemeFromZip } from '../../../utils/theme-installer'
import { invalidateThemeCache } from '../../../utils/theme-loader'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)

  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'theme' && p.filename)

  if (!file) {
    throw createError({ statusCode: 400, message: 'No file uploaded (expected field name "theme")' })
  }

  if (!file.filename?.toLowerCase().endsWith('.zip')) {
    throw createError({ statusCode: 400, message: 'File must be a .zip' })
  }

  const result = await installThemeFromZip(file.data)

  if (!result.ok) {
    throw createError({ statusCode: 400, message: result.error ?? 'Install failed' })
  }

  invalidateThemeCache()

  return { ok: true, themeId: result.themeId }
})
