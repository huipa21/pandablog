import { adminPasswordProblem, hashAdminPassword } from '../../utils/admin-password'
import { type AdminUser } from '../../utils/auth'
import { recordActivity } from '../../utils/activity'
import { readAdminCredentials, writeAdminCredentials } from '../../utils/settings'

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
  const user: AdminUser = {
    username: credentials.username,
    role: 'admin'
  }

  await setUserSession(event, {
    user,
    loggedInAt: new Date().toISOString()
  })

  recordActivity(event, {
    action: 'auth.setup',
    resource_type: 'session',
    resource_id: user.username,
    metadata: { username: user.username },
    description: 'Admin account setup completed'
  })

  return { user }
})