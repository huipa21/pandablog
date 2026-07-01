import { requireAuthenticatedUser } from '../../../../utils/auth'
import { revokeAllTrustedDevices } from '../../../../utils/mfa/trusted-devices'

export default defineEventHandler(async (event) => {
  if (!__PB_MODULE_MFA__) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const user = await requireAuthenticatedUser(event)
  await revokeAllTrustedDevices(event, user.id)
  return { ok: true }
})