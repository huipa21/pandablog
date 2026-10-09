import { writeBarrier, type WriteBarrier } from './maintenance'

export type StartupState = 'starting' | 'initializing' | 'ready' | 'recovery-required' | 'failed' | 'stopping'
interface StartupFailure { phase: 'ownership' | 'initialization' | 'recovery', category: string, step?: string }

/** Allow-listed metadata only: never expose SDK errors, SQL or credentials. */
function failureDiagnostic(error: unknown, phase: StartupFailure['phase']): StartupFailure {
  const data = (error as {data?: {reason?: unknown, kind?: unknown, scope?: unknown, phase?: unknown}})?.data
  if (phase === 'ownership' && typeof data?.reason === 'string' && ['maintenance-busy', 'ownership-guard-present', 'owner-unreadable', 'owner-corrupt', 'owner-remote', 'owner-live', 'owner-live-same-process', 'owner-offline-review'].includes(data.reason)) {
    return {phase, category: data.reason}
  }
  if (data?.kind === 'startup-configuration' && (data.reason === 'missing-scoped-credentials' || data.reason === 'invalid-scoped-username')) {
    return {phase, category: data.reason}
  }
  if (data?.kind === 'database-handshake' && (data.scope === 'root' || data.scope === 'database') && ['connection', 'authentication', 'selection'].includes(String(data.phase))) {
    return {phase, category: `database-${data.scope}-${data.phase}-failed`}
  }
  const step = (error as {pandaBootStep?: unknown} | null)?.pandaBootStep
  // Fixed boot-step names from db-init only; never SDK messages or SQL.
  if (phase === 'initialization' && typeof step === 'string' && /^[a-z0-9-]{1,64}$/.test(step)) {
    return {phase, category: 'initialization-failed', step}
  }
  return {phase, category: phase === 'ownership' ? 'configuration-or-ownership' : 'initialization-failed'}
}
interface StartupResources {
  validate: () => void
  acquireWriter: () => Promise<boolean>
  preserveFailure: () => Promise<void>
  releaseWriter: () => Promise<void>
  dispose: () => Promise<void>
  /** Trusted execution evidence, not an exception message/status code. */
  isPreMutationFailure?: (error: unknown) => boolean
  /** Monotonic count of observed DB connectivity failures. */
  connectivityFailures?: () => number
  /** Drop the runtime client and reconnect backoff before a retry. */
  resetDatabase?: () => Promise<void>
}
const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 60_000

/** Nitro does not await plugins. This coordinator owns every flight and uses
 * a private, unexported boot token; no HTTP caller can obtain boot authority.
 * Failure policy: a fenced diagnostic service, never ordinary admission. */
export class StartupCoordinator {
  private state: StartupState = 'starting'
  private readonly bootOwner = Object.freeze({})
  private resources?: StartupResources
  private ownership?: Promise<boolean>
  private initialization?: Promise<boolean>
  private closing?: Promise<void>
  private owned = false
  private unsafe = false
  private failure?: StartupFailure
  private retryableFailure = false
  private retry?: {attempt: number, nextAttemptAt: number}
  private wakeRetry?: () => void
  private disposing?: Promise<void>
  constructor(private readonly barrier: WriteBarrier, private readonly retryTiming: {baseMs: number, maxMs: number} = {baseMs: RETRY_BASE_MS, maxMs: RETRY_MAX_MS}) {}
  status() {return {state: this.state, ready: this.state === 'ready' && !this.barrier.status().closed, ...(this.failure ? {failure: {...this.failure}} : {}), ...(this.retry && this.state !== 'ready' ? {retry: {...this.retry}} : {})}}
  guidance() {
    if (this.retry && this.state === 'initializing') {
      return {message: 'The database is currently unreachable. PandaBlog keeps retrying automatically and will open as soon as the database responds; no restart or recovery is needed. If this persists, check the database service and network.', action: 'wait', recoveryRequired: false}
    }
    if (this.retryableFailure) {
      const category = this.failure?.category
      const message = category === 'invalid-scoped-username'
        ? 'NUXT_SURREAL_APP_USER must use letters, digits and underscores, starting with a letter or underscore. Hyphens are not supported.'
        : category === 'missing-scoped-credentials'
          ? 'Configure both NUXT_SURREAL_APP_USER and NUXT_SURREAL_APP_PASSWORD. With ROOT bootstrap configured, a missing user will be created.'
          : category?.endsWith('authentication-failed')
            ? 'Database sign-in failed before any mutation. Check the configured credentials and authentication scope.'
            : 'Startup failed before application mutations. Check the configuration and database connection.'
      return {message, action: 'fix-config-and-restart', recoveryRequired: false}
    }
    if (this.failure) return {message: 'Startup is blocked by unresolved ownership, partial initialization or uncertain execution. Run panda recover for guidance; do not delete recovery files.', action: 'run-recovery-assistant', recoveryRequired: true}
    return {message: this.status().ready ? 'PandaBlog is ready.' : 'PandaBlog is starting or temporarily unavailable. Please retry shortly.', action: 'wait', recoveryRequired: false}
  }
  private disposeResources() {
    return this.disposing ||= Promise.resolve().then(() => this.resources?.dispose())
  }

  /** No automatic retry or reopen: verified cleanup makes the NEXT process
   * start ordinary. A deadline is not cancellation; late disposal cannot
   * release authority after this attempt or shutdown has become unsafe. */
  private async cleanPreMutationFailure(error: unknown, deadlineMs = 5_000): Promise<boolean> {
    if (!this.resources?.isPreMutationFailure?.(error) || this.unsafe || this.barrier.status().active || this.barrier.status().uncertainWrites) return false
    let expired = false
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const cleanup = (async () => {
        await this.disposeResources()
        if (expired || this.unsafe || this.barrier.status().active || this.barrier.status().uncertainWrites || !this.resources!.isPreMutationFailure!(error)) throw new Error('Pre-mutation cleanup could not be verified')
        await this.resources!.releaseWriter()
        this.owned = false
      })()
      await Promise.race([cleanup, new Promise<never>((_, reject) => {
        timer = setTimeout(() => {expired = true; reject(new Error('Pre-mutation cleanup deadline exceeded'))}, deadlineMs)
      })])
      return true
    } catch {return false}
    finally {if (timer) clearTimeout(timer)}
  }

  start(resources: StartupResources): Promise<boolean> {
    if (this.ownership) return this.ownership
    this.resources = resources
    // close() changes admission before its first await. Capture its rejection.
    const fence = this.barrier.close(this.bootOwner, undefined, {ignoreUncertainty: true})
    this.ownership = (async () => {
      let validating = false
      try {
        await fence
        validating = true
        resources.validate() // before filesystem ownership or privileged work
        validating = false
        if (this.state === 'stopping') return false
        this.owned = await resources.acquireWriter()
        if (this.isStopping()) return false
        if (!this.owned) {
          this.state = 'recovery-required'
          this.failure = {phase: 'recovery', category: 'offline-recovery-required'}
          this.barrier.recoverFence()
          console.error('[startup] persisted restore or uncertain-write authority blocks initialization; removing only the writer lock cannot recover this state', this.failure)
          return false
        }
        return true
      } catch (error) {
        if (this.state !== 'stopping') this.state = 'failed'
        this.barrier.recoverFence()
        this.failure = failureDiagnostic(error, 'ownership')
        this.retryableFailure = validating
        console.error(this.retryableFailure
          ? '[startup] configuration is invalid; correct it and restart; no recovery cleanup is required for this attempt'
          : '[startup] writer ownership failed; service remains fenced; run panda recover for guidance', this.failure)
        return false
      }
    })()
    return this.ownership
  }

  initialize(work: () => Promise<void>): Promise<boolean> {
    if (this.initialization) return this.initialization
    this.initialization = (async () => {
      if (!this.ownership || !await this.ownership || this.state === 'stopping') return false
      for (let attempt = 1; ; attempt++) {
        this.state = 'initializing'
        // Leases from a failed attempt settle once its sockets are closed.
        for (let waited = 0; attempt > 1 && this.barrier.status().active && waited < 10_000 && !this.isStopping(); waited += 50) await new Promise(resolve => setTimeout(resolve, 50))
        if (this.isStopping()) return false
        const failuresBefore = this.resources?.connectivityFailures?.() ?? 0
        try {
          // Boot work is idempotent and re-run on every start; a time-bounded
          // uncertain-write window only restricts destructive maintenance.
          await this.barrier.runOwner(this.bootOwner, work, {ignoreUncertainty: true})
          if (this.isStopping()) return false
          this.barrier.reopen(this.bootOwner)
          this.state = 'ready'
          if (this.retry) console.info('[startup] database reachable again; initialization completed', {attempts: attempt})
          this.failure = undefined
          this.retry = undefined
          return true
        } catch (error) {
          this.failure = failureDiagnostic(error, 'initialization')
          // Our own shutdown interrupted boot: the next process re-runs it.
          if (this.isStopping()) return false
          if (this.isDatabaseOutage(error, failuresBefore)) {
            const delayMs = Math.min(this.retryTiming.maxMs, this.retryTiming.baseMs * 2 ** Math.min(attempt - 1, 6))
            this.retry = {attempt, nextAttemptAt: Date.now() + delayMs}
            console.warn('[startup] database unavailable during initialization; retrying automatically', {...this.failure, attempt, retryInMs: delayMs})
            await this.resources?.resetDatabase?.().catch(() => {})
            if (!await this.waitForRetry(delayMs)) return false
            continue
          }
          this.retry = undefined
          this.barrier.recoverFence()
          this.state = 'failed'
          if (await this.cleanPreMutationFailure(error)) {
            this.retryableFailure = true
            console.error('[startup] initialization failed before mutations; clients disposed and writer released; correct configuration/connection and restart', this.failure)
          } else {
            this.unsafe = true // partial/unknown execution is not proof of consistency
            try {await this.resources!.preserveFailure()} catch { /* Keep writer authority even if persistence fails. */ }
            console.error('[startup] initialization failed with a non-connectivity error; service remains fenced; run panda recover for guidance', this.failure)
          }
          return false
        }
      }
    })()
    return this.initialization
  }
  /** Connectivity, not data: a handshake failure, or any transport/deadline
   * failure observed while this attempt ran (helpers may wrap the cause). */
  private isDatabaseOutage(error: unknown, failuresBefore: number) {
    if ((error as {data?: {kind?: unknown}})?.data?.kind === 'database-handshake') return true
    return (this.resources?.connectivityFailures?.() ?? 0) > failuresBefore
  }
  private waitForRetry(delayMs: number): Promise<boolean> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {this.wakeRetry = undefined; resolve(!this.isStopping())}, delayMs)
      this.wakeRetry = () => {clearTimeout(timer); this.wakeRetry = undefined; resolve(false)}
    })
  }
  private isStopping() {return this.state === 'stopping'}

  stop(deadlineMs = 10_000): Promise<void> {
    if (this.closing) return this.closing
    this.state = 'stopping'
    this.wakeRetry?.()
    // Fence synchronously. Do not revoke the private boot scope while it drains.
    const drain = this.barrier.status().closed ? Promise.resolve() : this.barrier.close(this.bootOwner, Math.floor(deadlineMs * 0.4), {ignoreUncertainty: true})
    this.closing = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const settled = (async () => {
          await this.ownership
          // A drain timeout means DB calls are stuck (e.g. black-holed network).
          // Disposal closes their sockets, which settles them deterministically.
          await drain.catch(() => {})
          await this.disposeResources()
          await this.initialization?.catch(() => false)
          for (let waited = 0; this.barrier.status().active && waited < 1_000; waited += 25) await new Promise(resolve => setTimeout(resolve, 25))
          if (this.barrier.status().active) throw new Error('Unsettled writer work')
          if (this.owned && !this.unsafe) {await this.resources?.releaseWriter(); this.owned = false}
        })()
        await Promise.race([settled, new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Startup shutdown deadline exceeded')), deadlineMs)
        })])
      } catch {
        // A timeout is not cancellation. Late acquisition/boot cannot publish
        // ready; retain receipts instead of claiming a successful clean close.
        this.unsafe = true
        this.barrier.recoverFence()
        console.error('[startup] shutdown incomplete; writer authority preserved for offline review')
      } finally {if (timer) clearTimeout(timer)}
    })()
    return this.closing
  }
}
export const startup = new StartupCoordinator(writeBarrier)
