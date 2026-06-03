export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/admin')) {
    return
  }

  const setupStatus = await $fetch<{ completed: boolean }>('/api/auth/setup-status').catch(() => null)

  if (setupStatus && !setupStatus.completed && to.path !== '/admin/setup') {
    return navigateTo({ path: '/admin/setup', query: { redirect: to.fullPath } })
  }

  if (to.path === '/admin/setup') {
    if (setupStatus?.completed) {
      return navigateTo('/admin/login')
    }
    return
  }

  if (to.path === '/admin/login') {
    return
  }

  const session = await $fetch<{ loggedIn: boolean }>('/api/auth/session').catch(() => null)

  // Nuxt dev server restarts can briefly make API routes unavailable.
  // Do not force a logout redirect on transient transport/runtime errors.
  if (!session) {
    return
  }

  if (!session.loggedIn) {
    return navigateTo({ path: '/admin/login', query: { redirect: to.fullPath } })
  }
})