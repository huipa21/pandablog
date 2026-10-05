import { createHash } from 'node:crypto'

export interface RateLimitResult { allowed: boolean, retryAfterSec: number }
interface WindowRecord { count: number, expires: number }
interface WindowOptions { limit: number, windowMs: number }

/** Atomic synchronous reservations, finite cardinality and real untouched expiry.
 * One writer only: restart resets budgets; never evict LIVE keys to admit churn.
 */
export class ExpiringRateLimiter {
  private readonly records = new Map<string, WindowRecord>()
  private readonly timer: ReturnType<typeof setInterval>
  private closed = false
  private rejected = 0
  constructor(private readonly options: { maxKeys: number, sweepMs: number, now?: () => number }) {
    if (!Number.isInteger(options.maxKeys) || options.maxKeys < 1 || options.maxKeys > 100_000
      || !Number.isInteger(options.sweepMs) || options.sweepMs < 1 || options.sweepMs > 60_000) throw new Error('Invalid limiter limits')
    this.timer = setInterval(() => this.sweep(), options.sweepMs)
    this.timer.unref()
  }
  private now() { return this.options.now?.() ?? Date.now() }
  sweep() {
    const now = this.now()
    for (const [key, record] of this.records) if (record.expires <= now) this.records.delete(key)
  }
  diagnostics() { return { keys: this.records.size, maxKeys: this.options.maxKeys, rejected: this.rejected, closed: this.closed } }
  reserve(bucket: string, target: string, options: WindowOptions): RateLimitResult {
    if (typeof bucket !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(bucket)
      || typeof target !== 'string' || !target || Buffer.byteLength(target) > 1024
      || !Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1_000_000
      || !Number.isInteger(options.windowMs) || options.windowMs < 1 || options.windowMs > 86_400_000) throw new Error('Invalid rate-limit input')
    const deny = (retryAfterSec: number) => { this.rejected++; return {allowed: false, retryAfterSec} }
    if (this.closed) return deny(1)
    const now = this.now()
    const key = `${bucket}:${createHash('sha256').update(target).digest('hex')}`
    let record = this.records.get(key)
    if (record && record.expires <= now) { this.records.delete(key); record = undefined }
    if (!record) {
      if (this.records.size >= this.options.maxKeys) this.sweep()
      if (this.records.size >= this.options.maxKeys) return deny(1)
      record = {count: 0, expires: now + options.windowMs}
      this.records.set(key, record)
    }
    if (record.count >= options.limit) return deny(Math.max(1, Math.ceil((record.expires - now) / 1000)))
    record.count++ // reserved before the returned promise permits any work
    return {allowed: true, retryAfterSec: 0}
  }
  shutdown() { this.closed = true; clearInterval(this.timer); this.records.clear() }
}

export const rateLimiter = new ExpiringRateLimiter({ maxKeys: 10_000, sweepMs: 30_000 })
export async function consumeRateLimit(bucket: string, target: string, options: WindowOptions): Promise<RateLimitResult> {
  return rateLimiter.reserve(bucket, target, options)
}

/** Separate coarse IP and normalized account/target budgets; successes do not
 * reset a first-factor budget (in particular, MFA-pending is not full login).
 */
export async function reserveAuthAttempt(kind: 'login' | 'unlock' | 'mfa', ip: string, target: string): Promise<RateLimitResult> {
  const options = {limit: 5, windowMs: 15 * 60 * 1000}
  const ipRate = rateLimiter.reserve(`${kind}-ip`, ip, options)
  if (!ipRate.allowed) return ipRate
  return rateLimiter.reserve(`${kind}-target`, target.trim().toLowerCase(), options)
}
