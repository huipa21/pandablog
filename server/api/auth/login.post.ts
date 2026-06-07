import { recordActivity } from '../../utils/activity'
import { checkLoginRateLimit, recordLoginAttempt } from '../../utils/rate-limit'
import { getRuntimeFlags, isSetupCompleted } from '../../utils/settings'
import { findUserByUsername, toSessionUser, touchUserLogin, verifyUserPassword } from '../../utils/users'

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
    throw createError({ statusCode: 401, message: 'Invalid username or password' })
  }

  // ---- Issue session -------------------------------------------------------
  const user = toSessionUser(account!)

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

  return { user }
})