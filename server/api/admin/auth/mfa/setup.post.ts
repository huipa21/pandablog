import QRCode from 'qrcode'
import { resolveMfaActor, setMfaEnrollSecret } from '../../../../utils/mfa/session'
import { getUserMfaState } from '../../../../utils/mfa/store'
import { buildTotpUri, generateTotpSecret } from '../../../../utils/mfa/totp'
import { findUserById } from '../../../../utils/users'

// Start (or restart) TOTP enrollment. Generates a fresh secret, stashes it in
// the short-lived sealed session, and returns the otpauth URI + QR data URL so
// the user can add it to their authenticator app. The secret is only persisted
// to the database once `activate` confirms the user can produce a valid code.
export default defineEventHandler(async (event) => {
  const { userId } = await resolveMfaActor(event)

  const state = await getUserMfaState(userId)
  if (state?.enabled) {
    throw createError({ statusCode: 409, message: 'Multi-factor authentication is already enabled' })
  }

  const user = await findUserById(userId)
  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const secret = generateTotpSecret()
  const otpauth = buildTotpUri(secret, user.username)

  await setMfaEnrollSecret(event, secret)

  const qr = await QRCode.toDataURL(otpauth)

  return { secret, otpauth, qr }
})
