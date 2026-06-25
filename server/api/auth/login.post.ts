import { recordActivity } from '../../utils/activity'
import { checkLoginRateLimit, recordLoginAttempt } from '../../utils/rate-limit'
import { alertDetailsFromEvent, dispatchSecurityAlert } from '../../utils/notify/security-alert'
import { setMfaPending } from '../../utils/mfa/session'
import { getUserMfaState } from '../../utils/mfa/store'
import { getSecuritySettings, getRuntimeFlags, isSetupCompleted } from '../../utils/settings'
import { findUserByUsername, toSessionUser, touchUserLogin, verifyUserPassword } from '../../utils/users'
import type { UserRole } from '../../utils/users'

// Roles for which the `mfa_required_for_admins` enforcement applies.
const MFA_ENFORCED_ROLES: readonly UserRole[] = ['superadmin', 'admin']


export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string, password?: string }>(event)
  const username = body.username?.trim() ?? ''
  const password = body.password ?? ''
  const runtimeFlags = getRuntimeFlags()

  // ---- IP resolution -------------------------------------------------------
  const ip = getRequestIP(event, { xForwardedFor: runtimeFlags.trust_proxy_headers }) ?? null

  if (!ip) {
    if (runtimeFlags.trust_proxy_headers) {
      throw createError({
        statusCode: 400,
        message: 'Could not resolve client IP. Check reverse proxy configuration.'
      })
    }
    console.warn('⚠️  [auth] Could not resolve client IP; rate limiting will be skipped for this request.')
  }

  // ---- Rate limit (skipped only when ip is null in dev) --------------------
  if (ip) {
    const rate = await checkLoginRateLimit(ip)
    if (!rate.allowed) {
      setResponseHeader(event, 'Retry-After', rate.retryAfterSec)
      throw createError({
        statusCode: 429,
        message: `Too many attempts. Try again in ${rate.retryAfterSec}s.`
      })
    }
  }

  // ---- Config sanity check -------------------------------------------------
  if (!await isSetupCompleted()) {
    throw createError({
      statusCode: 503,
      message: 'Admin setup is required.'
    })
  }

  // ---- Verify credentials --------------------------------------------------
  const account = await findUserByUsername(username).catch(() => null)
  const passwordOk = await verifyUserPassword(account, password)
  const isValid = Boolean(account?.active && passwordOk)

  // ---- Record attempt (only when we have an IP) ----------------------------
  if (ip) {
    await recordLoginAttempt(ip, isValid)
  }

  if (!isValid) {
    recordActivity(event, {
      action: 'auth.login.failed',
      resource_type: 'session',
      resource_id: null,
      metadata: { username: username || null },
      description: 'Failed login attempt'
    })
    dispatchSecurityAlert('login.failed', alertDetailsFromEvent(event, {
      username: username || null,
      reason: 'Invalid username or password'
    }))

    // If this failure just pushed the IP over the lockout threshold, surface a
    // distinct lockout alert/audit entry (only fires once, on the locking hit).
    if (ip) {
      const afterAttempt = await checkLoginRateLimit(ip)
      if (!afterAttempt.allowed) {
        recordActivity(event, {
          action: 'auth.login.locked',
          resource_type: 'session',
          resource_id: null,
          metadata: { username: username || null, retry_after_sec: afterAttempt.retryAfterSec },
          description: 'Login locked after repeated failures'
        })
        dispatchSecurityAlert('login.locked', alertDetailsFromEvent(event, {
          username: username || null,
          reason: `Locked for ${afterAttempt.retryAfterSec}s after repeated failures`
        }))
      }
    }

    throw createError({ statusCode: 401, message: 'Invalid username or password' })
  }

  // ---- Issue session -------------------------------------------------------
  const user = toSessionUser(account!)

  // ---- Second factor (TOTP) ------------------------------------------------
  // A valid password is not enough when the account has MFA enabled, or when
  // enforcement requires an admin-tier account to enrol. In both cases we hold
  // a short-lived pending state in the session cookie and DO NOT issue a full
  // `user` session until the second step completes.
  if (__PB_MODULE_MFA__) {
    const mfaState = await getUserMfaState(user.id)
    if (mfaState?.enabled) {
      await setMfaPending(event, user.id, 'verify')
      return { mfa_required: true }
    }

    const security = getSecuritySettings()
    if (security.security_mfa_required_for_admins && MFA_ENFORCED_ROLES.includes(user.role)) {
      await setMfaPending(event, user.id, 'enroll')
      return { mfa_enrollment_required: true }
    }
  }

  await setUserSession(event, {
    user,
    loggedInAt: new Date().toISOString()
  })
  await touchUserLogin(user.id)

  recordActivity(event, {
    action: 'auth.login',
    resource_type: 'session',
    resource_id: user.id,
    metadata: { username: user.username, role: user.role },
    description: 'User signed in'
  })
  dispatchSecurityAlert('login.success', alertDetailsFromEvent(event, {
    username: user.username,
    reason: `Role: ${user.role}`
  }))

  return { user }
})