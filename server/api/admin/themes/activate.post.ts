import { requireSuperadmin } from '../../../utils/auth'
import { setActiveThemeId, loadTheme, invalidateThemeCache } from '../../../utils/theme-loader'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)

  const body = await readBody<{ themeId?: string }>(event)
  const themeId = body.themeId?.trim()

  if (!themeId) {
    throw createError({ statusCode: 400, message: 'themeId is required' })
  }

  // Verify the theme exists and loads cleanly before activating
  const theme = await loadTheme(themeId)
  if (!theme) {
    throw createError({ statusCode: 404, message: `Theme "${themeId}" not found or invalid` })
  }

  await setActiveThemeId(themeId)
  invalidateThemeCache()

  return { ok: true, activeId: themeId }
})
