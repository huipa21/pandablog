import { requireAdminTier } from '../../../utils/auth'
import { assertCanCreateUserRole } from '../../../utils/user-management'
import { createUser, isUserRole, type UserRole } from '../../../utils/users'

export default defineEventHandler(async (event) => {
  const actor = await requireAdminTier(event)
  const body = await readBody<Record<string, unknown>>(event)
  const role = isUserRole(body.role) ? body.role : 'viewer' satisfies UserRole
  if (role === 'superadmin') {
    throw createError({ statusCode: 400, message: 'The superadmin role is reserved for the seed admin account' })
  }
  assertCanCreateUserRole(actor, role)

  const user = await createUser({
    username: String(body.username ?? ''),
    password: String(body.password ?? ''),
    role,
    display_name: typeof body.display_name === 'string' ? body.display_name : null,
    email: typeof body.email === 'string' ? body.email : null,
    active: body.active !== false
  })

  return { user }
})