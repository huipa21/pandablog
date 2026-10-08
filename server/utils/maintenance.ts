import { randomBytes } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createError } from 'h3'

interface Scope { live: boolean, owner?: object, background: boolean }

/** A write whose response was lost (connection drop / response deadline) may
 * still be executing in SurrealDB, but never longer than its server-side query
 * and transaction timeouts. Inside this window destructive maintenance (restore,
 * backup jobs) is refused; ordinary service and startup are NOT blocked. Keep
 * SurrealDB's --query-timeout/--transaction-timeout well below this value. */
export const UNCERTAIN_WRITE_QUIESCENCE_MS = 10 * 60_000
interface BarrierOptions { ignoreUncertainty?: boolean }

/** One application writer. Leases cover operations, not only individual SQL. */
export class WriteBarrier {
  private context = new AsyncLocalStorage<Scope>()
  private active = 0
  private closed = false
  private owner?: object
  private onDrain?: () => void
  private generation = 0
  private readonly cachePrefix = randomBytes(16).toString('hex')
  cacheGeneration() {return `${this.cachePrefix}:${this.generation}`}
  private exclusiveStarted = false
  private uncertainCount = 0
  private uncertainUntil = 0
  private persistUncertain?: () => Promise<void>
  observeUncertainty(persist: () => Promise<void>) {this.persistUncertain = persist}
  async noteUncertain() {
    this.uncertainCount++
    this.uncertainUntil = Date.now() + UNCERTAIN_WRITE_QUIESCENCE_MS
    // Persisting only extends the restore quiescence window across restarts.
    // A failed write must not fence ordinary service.
    try {await this.persistUncertain?.()} catch {console.warn('[maintenance] could not persist uncertain-write marker; destructive maintenance stays blocked in this process')}
  }
  /** Carry a persisted window across restarts (restore stays refused until it ends). */
  seedUncertainty(untilMs: number) {
    if (untilMs > this.uncertainUntil) {this.uncertainUntil = untilMs; this.uncertainCount = Math.max(1, this.uncertainCount)}
  }
  private pendingUncertainWrites() {
    if (this.uncertainUntil && Date.now() >= this.uncertainUntil) {this.uncertainUntil = 0; this.uncertainCount = 0}
    return this.uncertainUntil ? Math.max(1, this.uncertainCount) : 0
  }
  status() { return { closed: this.closed, active: this.active, generation: this.generation, recoveryRequired: this.closed && !this.owner, uncertainWrites: this.pendingUncertainWrites(), uncertainUntil: this.uncertainUntil || undefined } }
  isBackground() { return this.context.getStore()?.background ?? false }
  acquire(): () => void {
    const scope = this.context.getStore()
    const admitted = scope?.live && (!scope.owner || scope.owner === this.owner)
    if (this.closed && !(scope?.live && scope.owner === this.owner && this.owner) && !admitted) throw createError({ statusCode: 503, message: 'Maintenance is fenced', data: { kind: 'maintenance-fenced', retryAfterSec: 15 } })
    this.active++
    let released = false
    return () => { if (released) return; released = true; this.active--; if (!this.active) this.onDrain?.() }
  }
  async run<T>(work: () => Promise<T>, background = false): Promise<T> {
    const release = this.acquire()
    const scope: Scope = { live: true, owner: this.context.getStore()?.owner, background: background || this.isBackground() }
    try { return await this.context.run(scope, work) } finally { scope.live = false; release() }
  }
  async close(owner: object, deadlineMs = 15_000, options: BarrierOptions = {}): Promise<void> {
    if (!options.ignoreUncertainty && this.pendingUncertainWrites()) throw new Error('Writer quiescence is uncertain; offline database recovery is required before restore')
    if (this.closed && this.owner !== owner) throw createError({statusCode: 409, message: 'Maintenance already owned or recovery required'})
    if (!this.closed) this.exclusiveStarted = false
    this.closed = true
    this.owner = owner
    if (!this.active) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.onDrain = undefined; reject(new Error('Maintenance drain deadline exceeded; no destructive work permitted')) }, deadlineMs)
      this.onDrain = () => {clearTimeout(timer); this.onDrain = undefined; resolve()}
    })
  }
  async runOwner<T>(owner: object, work: () => Promise<T>, options: BarrierOptions = {}): Promise<T> {
    if (!this.closed || this.owner !== owner || this.active || (!options.ignoreUncertainty && this.pendingUncertainWrites())) throw new Error('Invalid exclusive maintenance owner, undrained or uncertain writers')
    this.exclusiveStarted = true
    const scope: Scope = {live: true, owner, background: true}
    try {return await this.context.run(scope, work)} finally {scope.live = false}
  }
  cancelDrain(owner: object) {
    if (!this.closed || this.owner !== owner || this.exclusiveStarted) throw new Error('Cannot cancel an entered exclusive phase')
    this.closed = false; this.owner = undefined
  }
  reopen(owner: object) {
    if (!this.closed || this.owner !== owner || this.active) throw new Error('Cannot reopen unverified maintenance')
    this.closed = false; this.owner = undefined; this.generation++
  }
  recoverFence() { this.closed = true; this.owner = undefined; this.generation++ }
}
export const writeBarrier = new WriteBarrier()
