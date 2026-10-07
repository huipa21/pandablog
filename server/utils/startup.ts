import { writeBarrier, type WriteBarrier } from './maintenance'

export type StartupState = 'starting' | 'initializing' | 'ready' | 'recovery-required' | 'failed' | 'stopping'
interface StartupFailure { phase: 'ownership' | 'initialization' | 'recovery', category: string }

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
}

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
  private disposing?: Promise<void>
  constructor(private readonly barrier: WriteBarrier) {}
  status() {return {state: this.state, ready: this.state === 'ready' && !this.barrier.status().closed, ...(this.failure ? {failure: {...this.failure}} : {})}}
  guidance() {
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
    if (this.failure) return {message: 'Startup is blocked by unresolved ownership, partial initialization or uncertain execution. Run npm run recover for guidance; do not delete recovery files.', action: 'run-recovery-assistant', recoveryRequired: true}
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
    const fence = this.barrier.close(this.bootOwner)
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
          : '[startup] writer ownership failed; service remains fenced; run npm run recover for guidance', this.failure)
        return false
      }
    })()
    return this.ownership
  }

  initialize(work: () => Promise<void>): Promise<boolean> {
    if (this.initialization) return this.initialization
    this.initialization = (async () => {
      if (!this.ownership || !await this.ownership || this.state === 'stopping') return false
      this.state = 'initializing'
      try {
        await this.barrier.runOwner(this.bootOwner, work)
        if (this.barrier.status().uncertainWrites) throw new Error('Uncertain boot execution')
        if (this.isStopping()) return false
        this.barrier.reopen(this.bootOwner)
        this.state = 'ready'
        return true
      } catch (error) {
        this.failure = failureDiagnostic(error, 'initialization')
        this.barrier.recoverFence()
        if (!this.isStopping()) this.state = 'failed'
        if (await this.cleanPreMutationFailure(error)) {
          this.retryableFailure = true
          console.error('[startup] initialization failed before mutations; clients disposed and writer released; correct configuration/connection and restart', this.failure)
        } else {
          this.unsafe = true // partial/unknown execution is not proof of consistency
          try {await this.resources!.preserveFailure()} catch { /* Keep writer authority even if persistence fails. */ }
          console.error('[startup] partial or uncertain initialization; service remains fenced; run npm run recover for guidance', this.failure)
        }
        return false
      }
    })()
    return this.initialization
  }
  private isStopping() {return this.state === 'stopping'}

  stop(deadlineMs = 5_000): Promise<void> {
    if (this.closing) return this.closing
    this.state = 'stopping'
    // Fence synchronously. Do not revoke the private boot scope while it drains.
    const drain = this.barrier.status().closed ? Promise.resolve() : this.barrier.close(this.bootOwner, deadlineMs)
    this.closing = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const settled = (async () => {
          await Promise.all([drain, this.ownership, this.initialization])
          if (this.barrier.status().active || this.barrier.status().uncertainWrites) throw new Error('Unsettled writer work')
          await this.disposeResources()
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
