import type { SupportedLocale } from '~/utils/adminLocale'

export default defineNuxtPlugin(async (nuxtApp) => {
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

  await syncPublicLocale()

  watch(() => route.path, (path) => {
    void syncPublicLocale(path)
  })

  watch(locale, () => {
    void syncPublicLocale()
  })
})