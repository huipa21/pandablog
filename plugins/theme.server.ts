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
export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()
  const isAdminRoute = route.path.startsWith('/admin')

  useHead({
    link: [
      {
        rel: 'stylesheet',
        href: '/api/theme/css',
        // Identify so previews can swap it client-side
        'data-theme-stylesheet': 'true'
      }
    ],
    bodyAttrs: isAdminRoute ? undefined : { class: 'theme-scope' }
  })
})
