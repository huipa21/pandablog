export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/admin') || to.path === '/admin/login') {
    return
  }

  const session = await $fetch<{ loggedIn: boolean }>('/api/auth/session').catch(() => ({ loggedIn: false }))

  if (!session.loggedIn) {
    return navigateTo({ path: '/admin/login', query: { redirect: to.fullPath } })
  }
})