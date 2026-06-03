import { adminPasswordProblem, hashAdminPassword, verifyAdminPassword } from '../../utils/admin-password'
import { requireAdminUser } from '../../utils/auth'
import { recordActivity } from '../../utils/activity'
import { readAdminCredentials, writeAdminCredentials } from '../../utils/settings'

export default defineEventHandler(async (event) => {
  const user = await requireAdminUser(event)
  const body = await readBody<{ current_password?: string, new_password?: string, confirm_password?: string }>(event)
  const currentPassword = body.current_password ?? ''
  const newPassword = body.new_password ?? ''
  const confirmPassword = body.confirm_password ?? ''

  const credentials = await readAdminCredentials()
  const currentOk = await verifyAdminPassword(credentials.passwordHash, currentPassword)
  if (!currentOk) {
    throw createError({ statusCode: 400, message: 'Current password is incorrect' })
  }

  const passwordError = adminPasswordProblem(newPassword)
  if (passwordError) {
    throw createError({ statusCode: 400, message: passwordError })
  }

  if (newPassword !== confirmPassword) {
    throw createError({ statusCode: 400, message: 'Passwords do not match' })
  }

  const passwordHash = await hashAdminPassword(newPassword)
  await writeAdminCredentials(passwordHash)

  recordActivity(event, {
    action: 'auth.password.change',
    resource_type: 'session',
    resource_id: user.username,
    metadata: { username: user.username },
    description: 'Admin password changed'
  })

  return { ok: true }
})