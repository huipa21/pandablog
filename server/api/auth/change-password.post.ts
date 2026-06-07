import { adminPasswordProblem } from '../../utils/admin-password'
import { requireAuthenticatedUser } from '../../utils/auth'
import { recordActivity } from '../../utils/activity'
import { findUserById, setUserPassword, verifyUserPassword } from '../../utils/users'

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event)
  const body = await readBody<{ current_password?: string, new_password?: string, confirm_password?: string }>(event)
  const currentPassword = body.current_password ?? ''
  const newPassword = body.new_password ?? ''
  const confirmPassword = body.confirm_password ?? ''

  const account = await findUserById(user.id)
  const currentOk = await verifyUserPassword(account, currentPassword)
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

  await setUserPassword(user.id, newPassword)

  recordActivity(event, {
    action: 'auth.password.change',
    resource_type: 'session',
    resource_id: user.id,
    metadata: { username: user.username, role: user.role },
    description: 'User password changed'
  })

  return { ok: true }
})