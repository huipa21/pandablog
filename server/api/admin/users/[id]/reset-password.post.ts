import { requireAdminTier } from '../../../../utils/auth'
import { assertCanManageTargetUser, assertNotSelf } from '../../../../utils/user-management'
import { findUserById, setUserPassword } from '../../../../utils/users'

export default defineEventHandler(async (event) => {
  const actor = await requireAdminTier(event)
  const target = await findUserById(getRouterParam(event, 'id') ?? '')
  if (!target) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  assertCanManageTargetUser(actor, target)
  if (target.id === 'users:admin') {
    throw createError({ statusCode: 400, message: 'Use change password to update the admin password' })
  }
  assertNotSelf(actor, target, 'Use change password to update your own password')

  const body = await readBody<{ password?: string }>(event)
  await setUserPassword(target.id, body.password ?? '')

  return { ok: true }
})