import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobStore } from '../../server/utils/backups/jobMutex'

interface Fault {
  /** Which sign-in identity is rejected while `remaining` > 0. */
  failure?: 'root' | 'database'
  remaining: number
  failedClose?: boolean
}

async function load(fault: Fault, bootstrap = true) {
  Reflect.deleteProperty(globalThis, Symbol.for('pandablog.maintenance.barrier'))
  vi.resetModules()
  const instances: {query: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn>}[] = []
  vi.doMock('surrealdb', () => ({Surreal: class {
    connect = vi.fn().mockResolvedValue(undefined)
    signin = vi.fn(async (identity: object) => {
      if (fault.remaining > 0 && fault.failure === ('namespace' in identity ? 'database' : 'root')) {
        fault.remaining--
        throw new Error('synthetic-password SQL must-not-leak')
      }
    })
    use = vi.fn().mockResolvedValue(undefined)
    query = vi.fn().mockResolvedValue([[]])
    close = vi.fn(async () => {if (fault.failedClose) throw new Error('synthetic close failure')})
    constructor() {instances.push(this)}
  }}))
  vi.stubGlobal('useRuntimeConfig', () => ({surrealUrl: 'ws://fixture.invalid/rpc', surrealNamespace: 'fixture', surrealDatabase: 'fixture', surrealRoot: 'fixture_root', surrealRootPassword: bootstrap ? 'synthetic-root' : '', surrealAppUser: 'fixture_app', surrealAppPassword: 'synthetic-app'}))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const db = await import('../../server/utils/db')
  const {writeBarrier} = await import('../../server/utils/maintenance')
  const {StartupCoordinator} = await import('../../server/utils/startup')
  return {db, instances, barrier: writeBarrier, coordinator: new StartupCoordinator(writeBarrier, {baseMs: 5, maxMs: 20})}
}
const exists = (path: string) => stat(path).then(() => true, () => false)
afterEach(() => {vi.unstubAllGlobals(); vi.doUnmock('surrealdb'); vi.restoreAllMocks()})

async function boot(root: string, fault: Fault = {remaining: 0}, bootstrap = true, work?: (db: Awaited<ReturnType<typeof load>>['db']) => Promise<void>) {
  const fixture = await load(fault, bootstrap), store = new JobStore(root)
  const preserve = vi.fn(() => store.markUncertain())
  await fixture.coordinator.start({
    validate: () => {},
    checkRestore: async () => {const safe = await store.initializeRestoreState(); fixture.barrier.seedUncertainty(store.uncertaintyUntil()); return safe},
    connectivityFailures: fixture.db.databaseConnectivityFailureCount,
    resetDatabase: fixture.db.recycleRuntimeConnection,
    dispose: async () => {await fixture.db.shutdownDb(); if (fixture.db.databaseDiagnostics().ownedClients) throw new Error('Incomplete database disposal')}
  })
  const initializing = fixture.coordinator.initialize(async () => {
    await fixture.db.initializeRuntimeDatabase()
    await work?.(fixture.db)
  })
  return {...fixture, store, preserve, initializing}
}

describe('startup coordinator: DB outages self-heal; data failures stay fenced (mock DB; no configured endpoint)', () => {
  it.each([['root', true], ['database', false]] as const)('rejected %s sign-in retries in-process and opens without restart or recovery', async (failure, bootstrap) => {
    const root = await mkdtemp(join(tmpdir(), 'pb-self-heal-'))
    try {
      const run = await boot(root, {failure, remaining: 3}, bootstrap)
      expect(await run.initializing).toBe(true)
      expect(run.coordinator.status()).toMatchObject({state: 'ready', ready: true})
      expect(run.coordinator.status().failure).toBeUndefined()
      expect(run.preserve).not.toHaveBeenCalled()
      expect(await exists(join(root, '.uncertain-writes.json'))).toBe(false)
      expect(await exists(join(root, '.writer.lock'))).toBe(false)
      await run.coordinator.stop()
      expect(await exists(join(root, '.writer.lock'))).toBe(false)
    } finally {await rm(root, {recursive: true, force: true})}
  })

  it('reports wait guidance (not recovery) while the database is unreachable, and stop() releases the writer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pb-outage-stop-'))
    try {
      const run = await boot(root, {failure: 'root', remaining: Number.POSITIVE_INFINITY})
      await vi.waitFor(() => expect(run.coordinator.status().retry?.attempt).toBeGreaterThanOrEqual(2))
      expect(run.coordinator.status()).toMatchObject({state: 'initializing', ready: false, failure: {category: 'database-root-authentication-failed'}})
      expect(run.coordinator.guidance()).toMatchObject({action: 'wait', recoveryRequired: false})
      await run.coordinator.stop()
      expect(await run.initializing).toBe(false)
      expect(run.preserve).not.toHaveBeenCalled()
      expect(await exists(join(root, '.writer.lock'))).toBe(false)
      expect(await new JobStore(root).initializeRestoreState()).toBe(true)
    } finally {await rm(root, {recursive: true, force: true})}
  })

  it('scoped sign-in rejected AFTER ROOT provisioning is retried (idempotent bootstrap), not fenced', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pb-partial-boot-'))
    try {
      const run = await boot(root, {failure: 'database', remaining: 1}, true)
      expect(await run.initializing).toBe(true)
      expect(run.preserve).not.toHaveBeenCalled()
      await run.coordinator.stop()
      expect(await exists(join(root, '.writer.lock'))).toBe(false)
    } finally {await rm(root, {recursive: true, force: true})}
  })

  it('a client whose close() fails does not prevent recovery once the database answers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pb-failed-disposal-'))
    try {
      const run = await boot(root, {failure: 'root', remaining: 1, failedClose: true})
      expect(await run.initializing).toBe(true)
      expect(run.coordinator.status().ready).toBe(true)
    } finally {await rm(root, {recursive: true, force: true})}
  })

  it('a pending uncertain-write window does not block startup; it only refuses maintenance jobs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pb-legacy-uncertainty-'))
    try {
      await new JobStore(root).markUncertain()
      const before = await readFile(join(root, '.uncertain-writes.json'), 'utf8')
      const run = await boot(root)
      expect(await run.initializing).toBe(true)
      expect(run.barrier.status().uncertainWrites).toBeGreaterThan(0)
      expect(await readFile(join(root, '.uncertain-writes.json'), 'utf8')).toBe(before)
      await expect(run.store.acquire({id: 'b1', kind: 'restore', startedAt: new Date().toISOString()})).rejects.toMatchObject({data: {reason: 'uncertain-writes-quiescing'}})
      await run.coordinator.stop()
      expect(await exists(join(root, '.writer.lock'))).toBe(false)
    } finally {await rm(root, {recursive: true, force: true})}
  })

  it('a non-connectivity initialization failure stays unready without persistent ordinary recovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pb-data-failure-'))
    try {
      const run = await boot(root, {remaining: 0}, true, async () => {throw new Error('Unsupported or missing media storage layout marker')})
      expect(await run.initializing).toBe(false)
      expect(run.coordinator.status().state).toBe('failed')
      expect(run.coordinator.guidance().recoveryRequired).toBe(false)
      expect(run.preserve).not.toHaveBeenCalled()
      await run.coordinator.stop()
      expect(await exists(join(root, '.writer.lock'))).toBe(false)
      expect(await exists(join(root, '.uncertain-writes.json'))).toBe(false)
      const next = await boot(root)
      expect(await next.initializing).toBe(true)
      await next.coordinator.stop()
    } finally {await rm(root, {recursive: true, force: true})}
  })

  it('a forged handshake-shaped error cannot establish pre-mutation execution evidence', async () => {
    const {db} = await load({remaining: 0})
    expect(db.isPreMutationInitializationFailure({data: {kind: 'database-handshake', scope: 'root', phase: 'authentication'}})).toBe(false)
    await db.shutdownDb()
  })
})
