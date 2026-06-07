import { adminPasswordProblem, hashAdminPassword } from '../../utils/admin-password'
import { recordActivity } from '../../utils/activity'
import { readAdminCredentials, writeAdminCredentials } from '../../utils/settings'
import { findUserByUsername, toSessionUser } from '../../utils/users'

export default defineEventHandler(async (event) => {
  const existing = await readAdminCredentials()
  if (existing.setupCompleted) {
    throw createError({ statusCode: 409, message: 'Admin setup has already been completed' })
  }

  const body = await readBody<{ password?: string, confirm_password?: string }>(event)
  const password = body.password ?? ''
  const confirmPassword = body.confirm_password ?? ''

  const passwordError = adminPasswordProblem(password)
  if (passwordError) {
    throw createError({ statusCode: 400, message: passwordError })
  }

  if (password !== confirmPassword) {
    throw createError({ statusCode: 400, message: 'Passwords do not match' })
  }

  const passwordHash = await hashAdminPassword(password)
  const credentials = await writeAdminCredentials(passwordHash)
  const adminUser = await findUserByUsername(credentials.username)
  if (!adminUser) {
    throw createError({ statusCode: 500, message: 'Admin account was not created' })
  }
  const user = toSessionUser(adminUser)

  await setUserSession(event, {
    user,
    loggedInAt: new Date().toISOString()
  })

  recordActivity(event, {
    action: 'auth.setup',
    resource_type: 'session',
    resource_id: user.id,
    metadata: { username: user.username, role: user.role },
    description: 'Admin account setup completed'
  })

  return { user }
})