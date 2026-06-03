import argon2 from 'argon2'
import { constantTimeEqual, type AdminUser } from '../../utils/auth'
import { recordActivity } from '../../utils/activity'
import { checkLoginRateLimit, recordLoginAttempt } from '../../utils/rate-limit'
import { getRuntimeFlags, readAdminCredentials } from '../../utils/settings'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string, password?: string }>(event)
  const username = body.username?.trim() ?? ''
  const password = body.password ?? ''
  const credentials = await readAdminCredentials()
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
  if (!credentials.setupCompleted) {
    throw createError({
      statusCode: 503,
      message: 'Admin setup is required.'
    })
  }

  // ---- Verify credentials --------------------------------------------------
  // Always run argon2.verify — even on bad username — to keep timing uniform.
  const usernameOk = constantTimeEqual(username, credentials.username)
  let passwordOk = false
  try {
    passwordOk = await argon2.verify(credentials.passwordHash, password)
  } catch {
    passwordOk = false
  }

  const isValid = usernameOk && passwordOk

  // ---- Record attempt (only when we have an IP) ----------------------------
  if (ip) {
    await recordLoginAttempt(ip, isValid)
  }

  if (!isValid) {
    throw createError({ statusCode: 401, message: 'Invalid username or password' })
  }

  // ---- Issue session -------------------------------------------------------
  const user: AdminUser = {
    username: credentials.username,
    role: 'admin'
  }

  await setUserSession(event, {
    user,
    loggedInAt: new Date().toISOString()
  })

  recordActivity(event, {
    action: 'auth.login',
    resource_type: 'session',
    resource_id: user.username,
    metadata: { username: user.username },
    description: 'Admin user signed in'
  })

  return { user }
})