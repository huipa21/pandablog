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
      return navigateTo('/login')
    }
    return
  }

  if (to.path === '/admin/login') {
    return navigateTo({ path: '/login', query: { redirect: String(to.query.redirect ?? '/admin') } })
  }

  if (to.path === '/login') {
    return
  }

  const session = await $fetch<{ loggedIn: boolean, user: { role?: string } | null }>('/api/auth/session').catch(() => null)

  // Nuxt dev server restarts can briefly make API routes unavailable.
  // Do not force a logout redirect on transient transport/runtime errors.
  if (!session) {
    return
  }

  if (!session.loggedIn) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }

  const role = session.user?.role
  if (role === 'viewer') {
    return navigateTo('/')
  }

  if (to.path.startsWith('/admin/settings') || to.path.startsWith('/admin/logs')) {
    if (role !== 'superadmin') {
      return navigateTo('/admin')
    }
  }

  if (to.path.startsWith('/admin/users')) {
    if (role !== 'superadmin' && role !== 'admin') {
      return navigateTo('/admin')
    }
  }

  if (
    role === 'superadmin'
    && (
      to.path.startsWith('/admin/posts')
      || to.path.startsWith('/admin/categories')
      || to.path.startsWith('/admin/tags')
      || to.path.startsWith('/admin/media')
    )
  ) {
    return navigateTo('/admin/users')
  }
})