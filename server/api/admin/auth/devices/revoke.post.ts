import { requireAuthenticatedUser } from '../../../../utils/auth'
import { revokeTrustedDevice } from '../../../../utils/mfa/trusted-devices'

export default defineEventHandler(async (event) => {
  if (!__PB_MODULE_MFA__) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const user = await requireAuthenticatedUser(event)
  const body = await readBody<{ id?: string }>(event)
  const id = String(body?.id ?? '')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Device id is required' })
  }

  await revokeTrustedDevice(event, user.id, id)
  return { ok: true }
})