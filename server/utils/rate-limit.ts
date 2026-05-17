/**
 * Simple IP-based login rate limiter using Nitro's unstorage.
 *
 * Strategy:
 * - Track failed attempts per IP within a sliding 15-minute window.
 * - After 5 failed attempts, lock the IP for 15 minutes.
 * - Successful login clears the record for that IP.
 *
 * Storage: filesystem (configured in nuxt.config.ts as 'rate-limit' storage).
 */

const WINDOW_MS = 15 * 60 * 1000      // 15 minutes
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000     // 15 minutes
const STORAGE_BASE = 'rate-limit'

interface AttemptRecord {
  count: number
  firstAttempt: number
  lockedUntil?: number
}

function storage() {
  // useStorage is auto-imported by Nitro
  return useStorage(STORAGE_BASE)
}

function key(ip: string) {
  // Sanitize IP for use as a storage key (replace colons in IPv6, etc.)
  return `login:${ip.replace(/[^a-zA-Z0-9._-]/g, '_')}`
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSec: number
}

/**
 * Check whether the given IP is currently allowed to attempt login.
 * Call BEFORE verifying credentials.
 */
export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  const record = await storage().getItem<AttemptRecord>(key(ip))
  const now = Date.now()

  if (record?.lockedUntil && record.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((record.lockedUntil - now) / 1000)
    }
  }

  return { allowed: true, retryAfterSec: 0 }
}

/**
 * Record the outcome of a login attempt.
 * Call AFTER credential verification.
 */
export async function recordLoginAttempt(ip: string, success: boolean): Promise<void> {
  const k = key(ip)
  const store = storage()
  const now = Date.now()

  if (success) {
    await store.removeItem(k)
    return
  }

  const existing = await store.getItem<AttemptRecord>(k)
  const record: AttemptRecord = existing ?? { count: 0, firstAttempt: now }

  // Reset window if it has expired
  if (now - record.firstAttempt > WINDOW_MS) {
    record.count = 0
    record.firstAttempt = now
    delete record.lockedUntil
  }

  record.count += 1

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS
  }

  // TTL slightly longer than lockout to ensure cleanup
  await store.setItem(k, record, { ttl: Math.ceil((LOCKOUT_MS + WINDOW_MS) / 1000) })
}
