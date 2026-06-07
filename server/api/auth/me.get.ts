import { requireAuthenticatedUser } from '../../utils/auth'
import { findUserById } from '../../utils/users'

export default defineEventHandler(async (event) => {
  const sessionUser = await requireAuthenticatedUser(event)
  const user = await findUserById(sessionUser.id)

  if (!user || !user.active) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const { password_hash: _passwordHash, ...safeUser } = user
  return { user: safeUser }
})