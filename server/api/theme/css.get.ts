import { getActiveThemeId, loadTheme } from '../../utils/theme-loader'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const previewId = typeof query.theme === 'string' ? query.theme : null

  const themeId = previewId ?? await getActiveThemeId()
  const theme = await loadTheme(themeId)

  setResponseHeader(event, 'Content-Type', 'text/css; charset=utf-8')

  if (!theme) {
    const fallback = await loadTheme('default')
    if (!fallback) {
      setResponseStatus(event, 500)
      return '/* no theme loaded */'
    }
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return fallback.compiledCss
  }

  // Cache headers: previews short, active theme longer
  if (previewId) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
  } else {
    // Theme activation changes app_settings without changing the URL, so always revalidate.
    setResponseHeader(event, 'Cache-Control', 'no-cache, must-revalidate')
  }
  setResponseHeader(event, 'ETag', `"${theme.manifest.id}-${theme.version}"`)

  return theme.compiledCss
})
