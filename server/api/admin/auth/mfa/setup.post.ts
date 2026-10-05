import QRCode from 'qrcode'
import { readBoundedJson } from '../../../../utils/bounded-json'
import { requireRecentAuthentication } from '../../../../utils/mfa/recent-auth'
import { reserveAuthAttempt } from '../../../../utils/rate-limit'
import { resolveMfaActor, setMfaEnrollSecret } from '../../../../utils/mfa/session'
import { getUserMfaState } from '../../../../utils/mfa/store'
import { buildTotpUri, generateTotpSecret } from '../../../../utils/mfa/totp'
import { findUserById } from '../../../../utils/users'

// Start (or restart) TOTP enrollment. Generates a fresh secret, stashes it in
// the short-lived sealed session, and returns the otpauth URI + QR data URL so
// the user can add it to their authenticator app. The secret is only persisted
// to the database once `activate` confirms the user can produce a valid code.
export default defineEventHandler(async (event) => {
  const body = await readBoundedJson(event, 8 * 1024)
  if (body.password !== undefined && (typeof body.password !== 'string' || body.password.length > 200)) throw createError({statusCode: 400, message: 'Invalid MFA input'})
  const { userId, authEpoch, finalize } = await resolveMfaActor(event)
  const rate = await reserveAuthAttempt('mfa', getRequestIP(event, {xForwardedFor: true}) ?? 'noip', userId)
  if (!rate.allowed) {setResponseHeader(event, 'Retry-After', rate.retryAfterSec); throw createError({statusCode: 429, message: 'Too many MFA attempts'})}
  if (!finalize) await requireRecentAuthentication(event, userId, authEpoch, body.password)

  const state = await getUserMfaState(userId)
  if (state?.enabled) {
    throw createError({ statusCode: 409, message: 'Multi-factor authentication is already enabled' })
  }

  const user = await findUserById(userId)
  if (!user?.active || user.auth_epoch !== authEpoch) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  const secret = generateTotpSecret()
  const otpauth = buildTotpUri(secret, user.username)

  await setMfaEnrollSecret(event, secret, authEpoch)

  const qr = await QRCode.toDataURL(otpauth)

  return { secret, otpauth, qr }
})
