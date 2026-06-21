import { recordActivity } from '../../../utils/activity'
import { consumeRateLimit } from '../../../utils/rate-limit'
import { alertDetailsFromEvent, dispatchSecurityAlert } from '../../../utils/notify/security-alert'
import { getMfaPending } from '../../../utils/mfa/session'
import { getUserMfaState, setUserBackupCodes } from '../../../utils/mfa/store'
import { decryptMfaSecret } from '../../../utils/mfa/secret-crypto'
import { matchBackupCode, verifyTotpToken } from '../../../utils/mfa/totp'
import { getRuntimeFlags } from '../../../utils/settings'
import { findUserById, toSessionUser, touchUserLogin } from '../../../utils/users'

// Second step of a two-step login: verify a TOTP code (or an unused backup
// code) against the account named by the short-lived `verify` pending state,
// then issue the full authenticated session. Rate limited per IP+user so a
// pending token cannot be brute forced.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ code?: string }>(event)
  const code = String(body?.code ?? '').trim()

  const pending = await getMfaPending(event)
  if (!pending || pending.mode !== 'verify') {
    throw createError({ statusCode: 401, message: 'No pending login. Sign in again.' })
  }

  const ip = getRequestIP(event, { xForwardedFor: getRuntimeFlags().trust_proxy_headers }) ?? 'noip'
  const rate = await consumeRateLimit('login-mfa', `${ip}:${pending.userId}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000
  })
  if (!rate.allowed) {
    setResponseHeader(event, 'Retry-After', rate.retryAfterSec)
    throw createError({ statusCode: 429, message: `Too many attempts. Try again in ${rate.retryAfterSec}s.` })
  }

  const account = await findUserById(pending.userId)
  const state = await getUserMfaState(pending.userId)
  if (!account || !account.active || !state?.enabled || !state.secret) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'No pending login. Sign in again.' })
  }

  // TOTP first, then fall back to a one-time backup code.
  let ok = await verifyTotpToken(decryptMfaSecret(state.secret), code)
  let usedBackupCode = false
  if (!ok) {
    const backupIndex = await matchBackupCode(state.backupCodes, code)
    if (backupIndex >= 0) {
      ok = true
      usedBackupCode = true
      const remaining = state.backupCodes.filter((_, index) => index !== backupIndex)
      await setUserBackupCodes(pending.userId, remaining)
    }
  }

  if (!ok) {
    recordActivity(event, {
      action: 'auth.mfa.failed',
      resource_type: 'session',
      resource_id: account.id,
      metadata: { username: account.username },
      description: 'Failed multi-factor verification'
    })
    dispatchSecurityAlert('login.failed', alertDetailsFromEvent(event, {
      username: account.username,
      reason: 'Invalid multi-factor code'
    }))
    throw createError({ statusCode: 400, message: 'Invalid verification code' })
  }

  const user = toSessionUser(account)
  await replaceUserSession(event, {
    user,
    loggedInAt: new Date().toISOString()
  })
  await touchUserLogin(user.id)

  recordActivity(event, {
    action: 'auth.login',
    resource_type: 'session',
    resource_id: user.id,
    metadata: { username: user.username, role: user.role, mfa: true, backup_code: usedBackupCode },
    description: 'User signed in'
  })
  dispatchSecurityAlert('login.success', alertDetailsFromEvent(event, {
    username: user.username,
    reason: `Role: ${user.role}${usedBackupCode ? ' (MFA backup code)' : ' (MFA)'}`
  }))

  return { user, backup_codes_remaining: usedBackupCode ? state.backupCodes.length - 1 : state.backupCodes.length }
})
