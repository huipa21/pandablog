export default defineNuxtPlugin(() => {
  if (!import.meta.client || !('scrollRestoration' in window.history)) {
    return
  }

  const router = useRouter()
  window.history.scrollRestoration = 'manual'

  router.afterEach((to, from) => {
    if (to.path === from.path || to.hash) {
      return
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  })
})