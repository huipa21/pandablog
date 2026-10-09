import { afterEach, describe, expect, it, vi } from 'vitest'
import { WriteBarrier } from '../../server/utils/maintenance'
import { StartupCoordinator } from '../../server/utils/startup'
import { scopedCredentials } from '../../server/utils/startup-config'
function deferred<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>(yes => {resolve = yes}); return {promise, resolve}}
function fixture() {
  const barrier = new WriteBarrier(), coordinator = new StartupCoordinator(barrier, {baseMs: 5, maxMs: 10})
  const resources = {validate: vi.fn(), checkRestore: vi.fn().mockResolvedValue(true), dispose: vi.fn().mockResolvedValue(undefined)}
  vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {})
  return {barrier, coordinator, resources}
}
afterEach(() => {vi.restoreAllMocks(); vi.useRealTimers()})
describe('lightweight startup and bounded shutdown', () => {
  it('single-flights preflight and private boot; no ordinary background entry before readiness', async () => {
    const {barrier, coordinator, resources} = fixture(), pending = deferred<boolean>()
    resources.checkRestore.mockReturnValue(pending.promise)
    const flight = coordinator.start(resources)
    expect(coordinator.start(resources)).toBe(flight)
    const work = vi.fn(() => barrier.run(async () => undefined, true))
    const boot = coordinator.initialize(work)
    expect(coordinator.initialize(work)).toBe(boot)
    await expect(barrier.run(async () => undefined, true)).rejects.toMatchObject({statusCode: 503})
    expect(work).not.toHaveBeenCalled()
    pending.resolve(true)
    expect(await boot).toBe(true)
    expect(coordinator.status()).toEqual({state: 'ready', ready: true})
    await coordinator.stop(); await coordinator.stop()
    expect(resources.dispose).toHaveBeenCalledOnce()
    await expect(barrier.run(async () => undefined)).rejects.toThrow()
  })
  it.each(['configuration', 'preflight', 'restore'])('never initializes on %s failure; sanitized and no persistence callback', async kind => {
    const {coordinator, resources} = fixture()
    if (kind === 'configuration') resources.validate.mockImplementation(() => {throw new Error('secret SQL')})
    if (kind === 'preflight') resources.checkRestore.mockRejectedValue(new Error('secret SQL'))
    if (kind === 'restore') resources.checkRestore.mockResolvedValue(false)
    void coordinator.start(resources)
    const work = vi.fn()
    expect(await coordinator.initialize(work)).toBe(false)
    expect(work).not.toHaveBeenCalled()
    expect(coordinator.guidance().recoveryRequired).toBe(kind === 'restore')
    expect(JSON.stringify([coordinator.status(), vi.mocked(console.error).mock.calls])).not.toContain('secret SQL')
    await coordinator.stop()
  })
  it('validates scoped identity before preflight or privileged work', async () => {
    const {coordinator, resources} = fixture()
    resources.validate.mockImplementation(() => {scopedCredentials({surrealAppUser: 'fixture-app', surrealAppPassword: 'must-not-leak'})})
    expect(await coordinator.start(resources)).toBe(false)
    expect(resources.checkRestore).not.toHaveBeenCalled()
    expect(coordinator.status().failure).toEqual({phase: 'preflight', category: 'invalid-scoped-username'})
    expect(coordinator.guidance()).toMatchObject({action: 'fix-config-and-restart', recoveryRequired: false})
    await coordinator.stop()
  })
  it('partial non-connectivity boot stays unready; next independent start retries without expert cleanup', async () => {
    const first = fixture()
    await first.coordinator.start(first.resources)
    const error = Object.defineProperty(new Error('secret SQL'), 'pandaBootStep', {value: 'media-stage-recovery'})
    expect(await first.coordinator.initialize(async () => {throw error})).toBe(false)
    expect(first.coordinator.status().failure).toEqual({phase: 'initialization', category: 'initialization-failed', step: 'media-stage-recovery'})
    expect(first.coordinator.guidance().recoveryRequired).toBe(false)
    expect(first.barrier.status().closed).toBe(true)
    await first.coordinator.stop()
    const next = fixture(); await next.coordinator.start(next.resources)
    expect(await next.coordinator.initialize(async () => {})).toBe(true)
    await next.coordinator.stop()
  })
  it('retries handshake outages, sanitizes errors and cancels backoff on close', async () => {
    const {coordinator, resources} = fixture()
    await coordinator.start(resources)
    const error = Object.assign(new Error('must-not-leak'), {data: {kind: 'database-handshake', scope: 'root', phase: 'authentication'}})
    const work = vi.fn(async () => {throw error})
    const boot = coordinator.initialize(work)
    await vi.waitFor(() => expect(work.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(coordinator.status()).toMatchObject({state: 'initializing', ready: false, failure: {category: 'database-root-authentication-failed'}})
    expect(coordinator.guidance().recoveryRequired).toBe(false)
    expect(JSON.stringify([coordinator.status(), vi.mocked(console.warn).mock.calls])).not.toContain('must-not-leak')
    await coordinator.stop(); expect(await boot).toBe(false)
  })
  it('wrapped connectivity failures retry and reopen only after required boot succeeds', async () => {
    const {coordinator, resources} = fixture()
    let failures = 0, attempts = 0
    await coordinator.start({...resources, connectivityFailures: () => failures})
    expect(await coordinator.initialize(async () => {if (++attempts < 3) {failures++; throw new Error('wrapped')}})).toBe(true)
    expect(attempts).toBe(3)
    await coordinator.stop()
  })
  it('rejects arbitrary step/driver metadata in diagnostics', async () => {
    const {coordinator, resources} = fixture()
    await coordinator.start(resources)
    const error = {pandaBootStep: 'Password=secret', data: {scope: 'secret', phase: 'secret'}}
    expect(await coordinator.initialize(async () => {throw error})).toBe(false)
    expect(coordinator.status().failure).toEqual({phase: 'initialization', category: 'initialization-failed'})
    await coordinator.stop()
  })
  it('close while preflight pending cannot enter boot', async () => {
    const {coordinator, resources} = fixture(), pending = deferred<boolean>()
    resources.checkRestore.mockReturnValue(pending.promise)
    void coordinator.start(resources)
    const work = vi.fn(), boot = coordinator.initialize(work)
    await vi.waitFor(() => expect(resources.checkRestore).toHaveBeenCalledOnce())
    const close = coordinator.stop(); pending.resolve(true)
    await close; expect(await boot).toBe(false); expect(work).not.toHaveBeenCalled()
  })
  it.each(['boot', 'dispose'])('late %s after bounded close never republishes ready', async kind => {
    vi.useFakeTimers()
    const {coordinator, resources, barrier} = fixture(), pending = deferred<undefined>()
    if (kind === 'dispose') resources.dispose.mockReturnValue(pending.promise)
    await coordinator.start(resources)
    const boot = coordinator.initialize(() => kind === 'boot' ? pending.promise : Promise.resolve(undefined))
    await Promise.resolve(); await Promise.resolve()
    const close = coordinator.stop(10)
    await vi.advanceTimersByTimeAsync(11); await close
    expect(coordinator.shutdownDrained()).toBe(false)
    pending.resolve(undefined); await boot
    expect(coordinator.status().state).toBe('stopping')
    expect(coordinator.status().ready).toBe(false)
    expect(barrier.status().closed).toBe(true)
  })
})
