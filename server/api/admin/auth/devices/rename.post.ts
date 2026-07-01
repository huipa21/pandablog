import { requireAuthenticatedUser } from '../../../../utils/auth'
import { renameTrustedDevice } from '../../../../utils/mfa/trusted-devices'

export default defineEventHandler(async (event) => {
  if (!__PB_MODULE_MFA__) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const user = await requireAuthenticatedUser(event)
  const body = await readBody<{ id?: string, label?: string }>(event)
  const id = String(body?.id ?? '')
  const label = String(body?.label ?? '')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Device id is required' })
  }

  await renameTrustedDevice(user.id, id, label)
  return { ok: true }
})