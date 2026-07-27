import type { SupportedLocale } from '~/utils/adminLocale'

export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()
  const { locale, initPublicLocale } = usePublicLocale()
  const i18n = nuxtApp.$i18n as { setLocale: (locale: SupportedLocale) => Promise<void> }

  async function syncPublicLocale(path = route.path) {
    if (path.startsWith('/admin')) {
      return
    }

    const nextLocale = initPublicLocale()
    await i18n.setLocale(nextLocale)
  }

  // Defer the first locale detection until AFTER hydration completes. Reading
  // localStorage / navigator.language during plugin setup switches the locale
  // before hydration, so the client would render (e.g. zh-CN) while the server
  // rendered the default locale — producing hydration mismatches across dates,
  // translated strings and locale-keyed components. Running it on app:mounted
  // keeps the hydration render identical to the server, then updates once.
  nuxtApp.hook('app:mounted', () => {
    void syncPublicLocale()
  })

  watch(() => route.path, (path) => {
    void syncPublicLocale(path)
  })

  watch(locale, () => {
    void syncPublicLocale()
  })
})