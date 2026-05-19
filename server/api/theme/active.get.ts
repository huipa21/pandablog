import { getActiveThemeId, loadTheme } from '../../utils/theme-loader'

export default defineEventHandler(async (event) => {
  // Allow ?theme=<id> for preview (admin only — but we keep this public-readable
  // because it only reveals theme metadata, no sensitive data)
  const query = getQuery(event)
  const previewId = typeof query.theme === 'string' ? query.theme : null

  const themeId = previewId ?? await getActiveThemeId()
  const theme = await loadTheme(themeId)

  if (!theme) {
    // Fallback to default
    const fallback = await loadTheme('default')
    if (!fallback) throw createError({ statusCode: 500, message: 'No themes available' })
    return {
      id: fallback.manifest.id,
      name: fallback.manifest.name,
      version: fallback.manifest.version,
      layout: fallback.manifest.layout,
      supports: fallback.manifest.supports
    }
  }

  return {
    id: theme.manifest.id,
    name: theme.manifest.name,
    version: theme.manifest.version,
    layout: theme.manifest.layout,
    supports: theme.manifest.supports
  }
})
