import { requireAuthenticatedUser } from '../../../../utils/auth'
import { listTrustedDevices } from '../../../../utils/mfa/trusted-devices'

export default defineEventHandler(async (event) => {
  const user = await requireAuthenticatedUser(event)
  return { devices: await listTrustedDevices(event, user.id) }
})