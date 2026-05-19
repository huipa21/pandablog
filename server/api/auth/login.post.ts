import argon2 from 'argon2'
import { constantTimeEqual, type AdminUser } from '../../utils/auth'
import { recordActivity } from '../../utils/activity'
import { checkLoginRateLimit, recordLoginAttempt } from '../../utils/rate-limit'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{ username?: string, password?: string }>(event)
  const username = body.username?.trim() ?? ''
  const password = body.password ?? ''

  // ---- IP resolution -------------------------------------------------------
  // Trust X-Forwarded-For ONLY in production, where the app sits behind nginx.
  // In dev (no proxy) we use the raw socket IP to avoid spoofable headers.
  const isProd = config.appEnv === 'prod'
  const ip = getRequestIP(event, { xForwardedFor: isProd }) ?? null

  // If we can't resolve an IP at all, fail closed in prod (something is wrong
  // with the proxy chain) and warn-but-allow in dev (don't block local work).
  if (!ip) {
    if (isProd) {
      throw createError({
        statusCode: 400,
        message: 'Could not resolve client IP. Check reverse proxy configuration.'
      })
    }
    console.warn('⚠️  [auth] Could not resolve client IP in dev; rate limiting will be skipped for this request.')
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
  if (!config.adminPasswordHash) {
    throw createError({
      statusCode: 500,
      message: 'Admin password is not configured. Set ADMIN_PASSWORD_HASH (or APP_LOGIN_PASSWORD_HASH) in .env.'
    })
  }

  // ---- Verify credentials --------------------------------------------------
  // Always run argon2.verify — even on bad username — to keep timing uniform.
  const usernameOk = constantTimeEqual(username, config.adminUsername)
  let passwordOk = false
  try {
    passwordOk = await argon2.verify(config.adminPasswordHash, password)
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
    username: config.adminUsername,
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