import { writeBarrier, type WriteBarrier } from './maintenance'

export type StartupState = 'starting' | 'initializing' | 'ready' | 'recovery-required' | 'failed' | 'stopping'
interface StartupFailure { phase: 'preflight' | 'initialization' | 'recovery', category: string, step?: string }
function failureDiagnostic(error: unknown, phase: StartupFailure['phase']): StartupFailure {
  const data = (error as {data?: {reason?: unknown, kind?: unknown, scope?: unknown, phase?: unknown}})?.data
  if (data?.kind === 'startup-configuration' && ['missing-scoped-credentials', 'invalid-scoped-username'].includes(String(data.reason))) return {phase, category: String(data.reason)}
  if (data?.kind === 'database-handshake' && (data.scope === 'root' || data.scope === 'database') && ['connection', 'authentication', 'selection'].includes(String(data.phase))) return {phase, category: `database-${data.scope}-${data.phase}-failed`}
  const step = (error as {pandaBootStep?: unknown} | null)?.pandaBootStep
  if (phase === 'initialization' && typeof step === 'string' && /^[a-z0-9-]{1,64}$/.test(step)) return {phase, category: 'initialization-failed', step}
  return {phase, category: phase === 'preflight' ? 'configuration-or-preflight-failed' : 'initialization-failed'}
}
interface StartupResources {
  validate: () => void
  checkRestore: () => Promise<boolean>
  dispose: () => Promise<void>
  connectivityFailures?: () => number
  resetDatabase?: () => Promise<void>
}

/** Nitro does not await plugins. One handled boot flight and private in-memory
 * scope protect HTTP/cache/background entry; there is no app disk ownership. */
export class StartupCoordinator {
  private state: StartupState = 'starting'
  private readonly bootOwner = Object.freeze({})
  private resources?: StartupResources
  private preflight?: Promise<boolean>
  private initialization?: Promise<boolean>
  private closing?: Promise<void>
  private failure?: StartupFailure
  private retry?: {attempt: number, nextAttemptAt: number}
  private wakeRetry?: () => void
  private disposing?: Promise<void>
  private shutdownComplete = false
  constructor(private readonly barrier: WriteBarrier, private readonly retryTiming = {baseMs: 2_000, maxMs: 60_000}) {}
  status() {return {state: this.state, ready: this.state === 'ready' && !this.barrier.status().closed, ...(this.failure ? {failure: {...this.failure}} : {}), ...(this.retry && this.state !== 'ready' ? {retry: {...this.retry}} : {})}}
  guidance() {
    if (this.state === 'recovery-required') return {message: 'Interrupted destructive or ambiguous restore requires offline recovery. Preserve the restore journal and paired safety/media artifacts; run panda recover for read-only guidance.', action: 'run-recovery-assistant', recoveryRequired: true}
    if (this.retry && this.state === 'initializing') return {message: 'Database connection or sign-in is unavailable. PandaBlog retries automatically. Check database availability and configured credentials if this persists.', action: 'wait', recoveryRequired: false}
    if (this.failure) return {message: 'Required initialization failed. Correct the named configuration, migration or storage problem and restart normally. No application ownership cleanup is required.', action: 'fix-config-and-restart', recoveryRequired: false}
    return {message: this.status().ready ? 'PandaBlog is ready.' : 'PandaBlog is starting or temporarily unavailable. Please retry shortly.', action: 'wait', recoveryRequired: false}
  }
  shutdownDrained() {return this.isStopping() && this.shutdownComplete && !this.barrier.status().active && !this.barrier.exclusiveWorkPending()}
  private disposeResources() {return this.disposing ||= Promise.resolve().then(() => this.resources?.dispose())}
  private isStopping() {return this.state === 'stopping'}
  start(resources: StartupResources): Promise<boolean> {
    if (this.preflight) return this.preflight
    this.resources = resources
    const fence = this.barrier.close(this.bootOwner, undefined, {ignoreUncertainty: true})
    this.preflight = (async () => {
      try {
        await fence
        resources.validate()
        if (this.isStopping()) return false
        const safe = await resources.checkRestore()
        if (this.isStopping()) return false
        if (!safe) {
          this.state = 'recovery-required'
          this.failure = {phase: 'recovery', category: 'restore-recovery-required'}
          this.barrier.recoverFence()
          console.error('[startup] interrupted destructive or ambiguous restore blocks initialization', this.failure)
        }
        return safe
      } catch (error) {
        if (!this.isStopping()) this.state = 'failed'
        this.barrier.recoverFence()
        this.failure = failureDiagnostic(error, 'preflight')
        console.error('[startup] preflight failed; correct the underlying problem and restart normally', this.failure)
        return false
      }
    })()
    return this.preflight
  }
  initialize(work: () => Promise<void>): Promise<boolean> {
    if (this.initialization) return this.initialization
    this.initialization = (async () => {
      if (!this.preflight || !await this.preflight || this.isStopping()) return false
      for (let attempt = 1; ; attempt++) {
        this.state = 'initializing'
        for (let waited = 0; attempt > 1 && this.barrier.status().active && waited < 10_000 && !this.isStopping(); waited += 50) await new Promise(resolve => setTimeout(resolve, 50))
        if (this.isStopping()) return false
        const failuresBefore = this.resources?.connectivityFailures?.() ?? 0
        try {
          await this.barrier.runOwner(this.bootOwner, work, {ignoreUncertainty: true})
          if (this.isStopping()) return false
          this.barrier.reopen(this.bootOwner)
          this.state = 'ready'; this.failure = undefined; this.retry = undefined
          return true
        } catch (error) {
          if (this.isStopping()) return false
          this.failure = failureDiagnostic(error, 'initialization')
          if ((error as {data?: {kind?: unknown}})?.data?.kind === 'database-handshake' || (this.resources?.connectivityFailures?.() ?? 0) > failuresBefore) {
            const delayMs = Math.min(this.retryTiming.maxMs, this.retryTiming.baseMs * 2 ** Math.min(attempt - 1, 6))
            this.retry = {attempt, nextAttemptAt: Date.now() + delayMs}
            console.warn('[startup] database unavailable; retrying automatically', {...this.failure, attempt, retryInMs: delayMs})
            await this.resources?.resetDatabase?.().catch(() => {})
            if (!await this.waitForRetry(delayMs)) return false
            continue
          }
          this.retry = undefined; this.state = 'failed'
          this.barrier.recoverFence()
          // Deterministic boot errors remain unready in THIS process. The next
          // start reruns idempotent/resumable init; no generic failure receipt.
          console.error('[startup] required initialization failed; correct the underlying problem and restart normally', this.failure)
          return false
        }
      }
    })()
    return this.initialization
  }
  private waitForRetry(delayMs: number): Promise<boolean> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {this.wakeRetry = undefined; resolve(!this.isStopping())}, delayMs)
      this.wakeRetry = () => {clearTimeout(timer); this.wakeRetry = undefined; resolve(false)}
    })
  }
  stop(deadlineMs = 10_000): Promise<void> {
    if (this.closing) return this.closing
    this.state = 'stopping'; this.wakeRetry?.()
    this.barrier.stopAdmission()
    const drain = this.barrier.status().closed ? Promise.resolve() : this.barrier.close(this.bootOwner, Math.floor(deadlineMs * 0.4), {ignoreUncertainty: true})
    this.closing = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const settled = (async () => {
          await this.preflight
          await drain.catch(() => {})
          await this.disposeResources()
          await this.initialization?.catch(() => false)
          for (let waited = 0; (this.barrier.status().active || this.barrier.exclusiveWorkPending()) && waited < 1_000; waited += 25) await new Promise(resolve => setTimeout(resolve, 25))
          if (this.barrier.status().active || this.barrier.exclusiveWorkPending()) throw new Error('Unsettled work')
          this.shutdownComplete = true
        })()
        await Promise.race([settled, new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error('Shutdown deadline exceeded')), deadlineMs)})])
      } catch {
        this.barrier.recoverFence()
        console.error('[startup] bounded shutdown incomplete; replacement can initialize normally unless destructive restore is unresolved')
      } finally {if (timer) clearTimeout(timer)}
    })()
    return this.closing
  }
}
export const startup = new StartupCoordinator(writeBarrier)
