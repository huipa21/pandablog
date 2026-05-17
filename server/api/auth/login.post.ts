import { constantTimeEqual, type AdminUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{ username?: string, password?: string }>(event)
  const username = body.username?.trim() ?? ''
  const password = body.password ?? ''

  if (!config.adminPassword) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Admin password is not configured'
    })
  }

  const isValid = constantTimeEqual(username, config.adminUsername)
    && constantTimeEqual(password, config.adminPassword)

  if (!isValid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid username or password' })
  }

  const user: AdminUser = {
    username: config.adminUsername,
    role: 'admin'
  }

  await setUserSession(event, {
    user,
    loggedInAt: new Date().toISOString()
  })

  return { user }
})