import { createError } from 'h3'

interface Waiting {
  resolve: (release: () => void) => void
  reject: (error: Error) => void
  cleanup: () => void
}

/** Single-process finite admission. Cancellation cannot cancel native work. */
export class BoundedAdmission {
  private active = 0
  private queue: Waiting[] = []
  private closed = false
  private highActive = 0
  private highWaiting = 0
  private rejected = 0
  private drained?: () => void
  private closing?: Promise<boolean>
  constructor(private readonly limits: { active: number, waiting: number, waitMs: number }, private readonly label = 'Password work') {
    if (!Number.isInteger(limits.active) || limits.active < 1 || limits.active > 16
      || !Number.isInteger(limits.waiting) || limits.waiting < 0 || limits.waiting > 128
      || !Number.isInteger(limits.waitMs) || limits.waitMs < 1 || limits.waitMs > 30_000) throw new Error('Invalid admission limits')
  }
  diagnostics() { return { active: this.active, waiting: this.queue.length, highActive: this.highActive, highWaiting: this.highWaiting, rejected: this.rejected, closed: this.closed } }
  private unavailable(shutdown = false) {
    this.rejected++
    return createError({ statusCode: shutdown ? 503 : 429, message: shutdown ? `${this.label} is shutting down` : `${this.label} capacity exceeded`, data: { retryAfterSec: 1 } })
  }
  private lease(): () => void {
    this.active++
    this.highActive = Math.max(this.highActive, this.active)
    let released = false
    return () => {
      if (released) return
      released = true
      this.active--
      const next = this.closed ? undefined : this.queue.shift()
      if (next) { next.cleanup(); next.resolve(this.lease()) }
      if (!this.active) this.drained?.()
    }
  }
  acquire(signal?: AbortSignal): Promise<() => void> {
    if (this.closed) return Promise.reject(this.unavailable(true))
    if (signal?.aborted) return Promise.reject(new Error(`${this.label} aborted`))
    if (this.active < this.limits.active) return Promise.resolve(this.lease())
    if (this.queue.length >= this.limits.waiting) return Promise.reject(this.unavailable())
    return new Promise((resolve, reject) => {
      const remove = (error: Error) => {
        const index = this.queue.indexOf(waiting)
        if (index < 0) return
        this.queue.splice(index, 1)
        waiting.cleanup()
        reject(error)
      }
      const abort = () => remove(new Error(`${this.label} aborted`))
      const timer = setTimeout(() => remove(this.unavailable()), this.limits.waitMs)
      const waiting: Waiting = { resolve, reject, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) } }
      signal?.addEventListener('abort', abort, {once: true})
      this.queue.push(waiting)
      this.highWaiting = Math.max(this.highWaiting, this.queue.length)
    })
  }
  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal)
    try {
      if (signal?.aborted) throw new Error('Password work aborted')
      const result = await work()
      // No Promise.race that would free a still-running Argon2 allocation.
      if (signal?.aborted) throw new Error('Password work aborted')
      return result
    } finally { release() }
  }
  shutdown(waitMs = 5_000): Promise<boolean> {
    if (!Number.isInteger(waitMs) || waitMs < 1 || waitMs > 30_000) throw new Error('Invalid drain deadline')
    this.closed = true
    for (const waiting of this.queue.splice(0)) { waiting.cleanup(); waiting.reject(this.unavailable(true)) }
    if (!this.active) return Promise.resolve(true)
    this.closing ??= new Promise(resolve => {
      const finish = (drained: boolean) => { clearTimeout(timer); this.drained = undefined; resolve(drained) }
      const timer = setTimeout(() => finish(false), waitMs)
      this.drained = () => finish(true)
    })
    return this.closing
  }
}

export const passwordAdmission = new BoundedAdmission({ active: 2, waiting: 16, waitMs: 2_000 })
