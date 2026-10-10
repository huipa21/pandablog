import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'

const jobs = vi.hoisted(() => ({initializeRestoreState: vi.fn(), markUncertain: vi.fn(), maintenanceHoldUntil: vi.fn(), initializeRuntimeDatabase: vi.fn()}))
vi.mock('../../server/utils/backups/jobMutex', () => ({jobStore: jobs}))
vi.mock('../../server/utils/db', () => ({shutdownDb: vi.fn(), databaseDiagnostics: () => ({ownedClients: 0}), isPreMutationInitializationFailure: () => false, databaseConnectivityFailureCount: () => 0, recycleRuntimeConnection: vi.fn(), initializeRuntimeDatabase: jobs.initializeRuntimeDatabase}))
vi.mock('../../server/utils/startup-config', () => ({validateStartupConfig: vi.fn(), normalizePublicRuntimeConfig: vi.fn()}))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => {resolve = yes})
  return {promise, resolve}
}
afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks()})

async function load(ownership: Promise<boolean> | (() => Promise<boolean>)) {
  vi.resetModules(); vi.resetAllMocks()
  jobs.initializeRestoreState.mockImplementation(() => typeof ownership === 'function' ? ownership() : ownership)
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  jobs.markUncertain.mockResolvedValue(undefined)
  const hooks: Record<string, () => Promise<void>> = {}
  const app = createApp()
  app.use(defineEventHandler(() => ({ordinary: true})))
  const {default: plugin} = await import('../../server/plugins/00-maintenance')
  // The installed Nitro loop intentionally does NOT await plugin results.
  plugin({h3App: app, hooks: {hook: (name: string, fn: () => Promise<void>) => {hooks[name] = fn}}} as never)
  return {app, hooks, barrier: (await import('../../server/utils/maintenance')).writeBarrier}
}

describe('non-awaiting Nitro startup plugin lifecycle', () => {
  it('fences synchronously and registers close before slow ownership settles', async () => {
    const pending = deferred<boolean>()
    const {app, hooks, barrier} = await load(pending.promise)
    expect(barrier.status().closed).toBe(true)
    expect(hooks.close).toBeTypeOf('function')
    const server = createServer(toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as {port: number}
    try {
      for (const route of ['/', '/api/auth/setup', '/api/posts', '/__nuxt_error']) {
        const response = await fetch(`http://127.0.0.1:${address.port}${route}`)
        expect(response.status).toBe(503)
        expect(response.headers.get('retry-after')).toBe('15')
      }
    } finally {
      pending.resolve(false)
      await hooks.close!()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
    expect(jobs.markUncertain).not.toHaveBeenCalled()
  })
  it('actual db-init plugin cannot allocate privileged clients while ownership is pending or refused', async () => {
    const pending = deferred<boolean>()
    const {hooks} = await load(pending.promise)
    const {default: initialize} = await import('../../server/plugins/db-init')
    const flight = initialize({} as never)
    expect(jobs.initializeRuntimeDatabase).not.toHaveBeenCalled()
    pending.resolve(false)
    await flight
    expect(jobs.initializeRuntimeDatabase).not.toHaveBeenCalled()
    await hooks.close!()
  })
  it('handles rejected ownership in the actual plugin without starting boot', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const {barrier, hooks} = await load(() => Promise.reject(new Error('synthetic private failure')))
    const {startup} = await import('../../server/utils/startup')
    const boot = vi.fn()
    expect(await startup.initialize(boot)).toBe(false)
    expect(startup.status().state).toBe('failed')
    expect(barrier.status().closed).toBe(true)
    expect(boot).not.toHaveBeenCalled()
    await hooks.close!()
    expect(jobs.markUncertain).not.toHaveBeenCalled()
  })
})
