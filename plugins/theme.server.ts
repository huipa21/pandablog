/**
 * Server-side theme injection.
 * Adds a <link> to /api/theme/css in the HTML <head> so public and admin
 * surfaces share one token source.
 *
 * The CSS endpoint reads the active theme from DB and serves compiled CSS with
 * tokens as :root variables and the theme.css overrides appended.
 *
 * For preview, the admin page passes ?theme=<id> via an iframe; the link is
 * added client-side with the same query in that case.
 */
import { getActiveThemeId, loadTheme } from '~/server/utils/theme-loader'

export default defineNuxtPlugin(async () => {
  const route = useRoute()
  const themeQuery = route.query.theme
  const previewThemeId = typeof themeQuery === 'string' ? themeQuery : null
  const isAdminRoute = route.path === '/admin' || route.path.startsWith('/admin/')
  const themeId = previewThemeId ?? (isAdminRoute ? 'default' : await getActiveThemeId())
  const theme = await loadTheme(themeId)
  const variant = theme?.manifest.layout.variant ?? themeId

  useHead({
    link: [
      {
        rel: 'stylesheet',
        href: `/api/theme/css?theme=${encodeURIComponent(themeId)}`,
        // Identify so previews can swap it client-side
        'data-theme-stylesheet': 'true'
      }
    ],
    bodyAttrs: { class: 'theme-scope', 'data-theme-variant': variant }
  })
})
