import type { SupportedLocale } from '~/utils/adminLocale'

/**
 * Applies the public-site language (see usePublicLocale) on public routes.
 *
 * Runs on the server AND on the client before hydration with the same input
 * (the `pb-public-locale` cookie, else the default), so the hydration render
 * always matches the server HTML. Browser-language detection for first-time
 * visitors happens only after mount, and is then persisted in the cookie.
 *
 * Admin routes are skipped: layouts/admin.vue applies the admin language.
 */
export default defineNuxtPlugin({
  name: 'pb:public-locale',
  dependsOn: ['i18n:plugin:route-locale-detect'],
  async setup(nuxtApp) {
    const { locale, initPublicLocale } = usePublicLocale()
    const i18n = nuxtApp.$i18n as unknown as {
      locale: { value: string }
      setLocale: (locale: SupportedLocale) => Promise<void>
    }

    async function applyPublicLocale(path: string) {
      if (path.startsWith('/admin')) {
        return
      }
      if (i18n.locale.value !== locale.value) {
        await i18n.setLocale(locale.value)
      }
    }

    const initialPath = import.meta.server ? useRequestURL().pathname : window.location.pathname
    await applyPublicLocale(initialPath)

    if (import.meta.server) {
      return
    }

    const route = useRoute()

    // Not `app:mounted`: with async layouts it fires while hydration is still
    // in progress, so switching there caused mismatches. onNuxtReady runs once
    // the whole initial hydration has finished.
    onNuxtReady(() => {
      initPublicLocale()
      void applyPublicLocale(route.path)
    })

    watch(() => route.path, (path) => {
      void applyPublicLocale(path)
    })

    watch(locale, () => {
      void applyPublicLocale(route.path)
    })
  }
})
