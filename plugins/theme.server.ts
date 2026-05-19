/**
 * Server-side theme injection.
 * Adds a <link> to /api/theme/css in the HTML <head> for non-admin pages.
 *
 * The CSS endpoint reads the active theme from DB and serves compiled CSS with
 * tokens as :root variables and the theme.css overrides appended.
 *
 * For preview, the admin page passes ?theme=<id> via an iframe; the link is
 * added client-side with the same query in that case.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()

  // Don't inject on admin routes — admin uses fixed Nuxt UI styling.
  if (route.path.startsWith('/admin')) return

  useHead({
    link: [
      {
        rel: 'stylesheet',
        href: '/api/theme/css',
        // Identify so previews can swap it client-side
        'data-theme-stylesheet': 'true'
      }
    ],
    // Wrap public-blog body content with theme-scope class via a script-free approach
    bodyAttrs: {
      class: 'theme-scope'
    }
  })
})
