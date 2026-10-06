import { randomBytes } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createError } from 'h3'

interface Scope { live: boolean, owner?: object, background: boolean }

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
  private uncertainWrites = 0
  private persistUncertain?: () => Promise<void>
  observeUncertainty(persist: () => Promise<void>) {this.persistUncertain = persist}
  async noteUncertain() {
    this.uncertainWrites++
    try {await this.persistUncertain?.()} catch {this.recoverFence(); throw new Error('Could not persist uncertain-write recovery authority')}
  }
  status() { return { closed: this.closed, active: this.active, generation: this.generation, recoveryRequired: this.closed && !this.owner, uncertainWrites: this.uncertainWrites } }
  isBackground() { return this.context.getStore()?.background ?? false }
  acquire(): () => void {
    const scope = this.context.getStore()
    const admitted = scope?.live && (!scope.owner || scope.owner === this.owner)
    if (this.closed && !(scope?.live && scope.owner === this.owner && this.owner) && !admitted) throw createError({ statusCode: 503, message: 'Maintenance is fenced', data: { retryAfterSec: 15 } })
    this.active++
    let released = false
    return () => { if (released) return; released = true; this.active--; if (!this.active) this.onDrain?.() }
  }
  async run<T>(work: () => Promise<T>, background = false): Promise<T> {
    const release = this.acquire()
    const scope: Scope = { live: true, owner: this.context.getStore()?.owner, background: background || this.isBackground() }
    try { return await this.context.run(scope, work) } finally { scope.live = false; release() }
  }
  async close(owner: object, deadlineMs = 15_000): Promise<void> {
    if (this.uncertainWrites) throw new Error('Writer quiescence is uncertain; offline database recovery is required before restore')
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
  async runOwner<T>(owner: object, work: () => Promise<T>): Promise<T> {
    if (!this.closed || this.owner !== owner || this.active || this.uncertainWrites) throw new Error('Invalid exclusive maintenance owner, undrained or uncertain writers')
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
