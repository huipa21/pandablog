import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JobStore } from '../../server/utils/backups/jobMutex'

async function load(failure?: 'root' | 'database', bootstrap = true, failedClose = false) {
  vi.resetModules()
  const instances: {query: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn>}[] = []
  vi.doMock('surrealdb', () => ({Surreal: class {
    connect = vi.fn().mockResolvedValue(undefined)
    signin = vi.fn(async (identity: object) => {
      if (failure === ('namespace' in identity ? 'database' : 'root')) throw new Error('synthetic-password SQL must-not-leak')
    })
    use = vi.fn().mockResolvedValue(undefined)
    query = vi.fn().mockResolvedValue([[]])
    close = vi.fn(async () => {if (failedClose) throw new Error('synthetic close failure')})
    constructor() {instances.push(this)}
  }}))
  vi.stubGlobal('useRuntimeConfig', () => ({surrealUrl: 'ws://fixture.invalid/rpc', surrealNamespace: 'fixture', surrealDatabase: 'fixture', surrealRoot: 'fixture_root', surrealRootPassword: bootstrap ? 'synthetic-root' : '', surrealAppUser: 'fixture_app', surrealAppPassword: 'synthetic-app'}))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const db = await import('../../server/utils/db')
  const {writeBarrier} = await import('../../server/utils/maintenance')
  const {StartupCoordinator} = await import('../../server/utils/startup')
  return {db, instances, barrier: writeBarrier, coordinator: new StartupCoordinator(writeBarrier)}
}
const exists = (path: string) => stat(path).then(() => true, () => false)
afterEach(() => {vi.unstubAllGlobals(); vi.doUnmock('surrealdb'); vi.restoreAllMocks()})

async function boot(root: string, failure?: 'root' | 'database', bootstrap = true, failedClose = false) {
  const fixture = await load(failure, bootstrap, failedClose), store = new JobStore(root)
  const preserve = vi.fn(() => store.markUncertain())
  await fixture.coordinator.start({
    validate: () => {}, acquireWriter: () => store.startWriter(), preserveFailure: preserve,
    isPreMutationFailure: fixture.db.isPreMutationInitializationFailure,
    releaseWriter: async () => {if (!await store.stopWriter()) throw new Error('Writer release failed')},
    dispose: async () => {await fixture.db.shutdownDb(); if (fixture.db.databaseDiagnostics().ownedClients) throw new Error('Incomplete database disposal')}
  })
  const ready = await fixture.coordinator.initialize(async () => {await fixture.db.initializeRuntimeDatabase()})
  return {...fixture, store, preserve, ready}
}

describe('real coordinator + DB execution evidence + owned receipts (mock DB; no configured endpoint)', () => {
  it.each([['root', true], ['database', false]] as const)('failed %s sign-in before SQL creates no recovery marker; corrected start succeeds', async (failure, bootstrap) => {
    const root = await mkdtemp(join(tmpdir(), 'pb-pre-mutation-'))
    try {
      const failed = await boot(root, failure, bootstrap)
      expect(failed.ready).toBe(false)
      expect(failed.coordinator.guidance()).toMatchObject({recoveryRequired: false, action: 'fix-config-and-restart'})
      expect(failed.preserve).not.toHaveBeenCalled()
      expect(failed.instances.every(client => !client.query.mock.calls.length)).toBe(true)
      expect(await exists(join(root, '.uncertain-writes.json'))).toBe(false)
      expect(await exists(join(root, '.writer.lock'))).toBe(false)
      await failed.coordinator.stop()
      const corrected = await boot(root, undefined, bootstrap)
      expect(corrected.ready).toBe(true)
      expect(await exists(join(root, '.writer.lock'))).toBe(true)
      await corrected.coordinator.stop()
      expect(await exists(join(root, '.writer.lock'))).toBe(false)
    } finally {await rm(root, {recursive: true, force: true})}
  })
  it('scoped sign-in rejected AFTER ROOT provisioning remains a partial initialization failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pb-partial-boot-'))
    try {
      const failed = await boot(root, 'database', true)
      expect(failed.ready).toBe(false)
      expect(failed.instances[0]!.query).toHaveBeenCalledTimes(2)
      expect(failed.preserve).toHaveBeenCalledOnce()
      expect(failed.coordinator.guidance().recoveryRequired).toBe(true)
      expect(await exists(join(root, '.uncertain-writes.json'))).toBe(true)
      await failed.coordinator.stop()
      expect(await exists(join(root, '.writer.lock'))).toBe(true)
      expect(await new JobStore(root).startWriter()).toBe(false)
    } finally {await rm(root, {recursive: true, force: true})}
  })
  it('failed socket disposal cannot claim a verified clean pre-mutation exit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pb-failed-disposal-'))
    try {
      const failed = await boot(root, 'root', true, true)
      expect(failed.ready).toBe(false)
      expect(failed.db.databaseDiagnostics().ownedClients).toBe(1)
      expect(failed.preserve).toHaveBeenCalledOnce()
      await failed.coordinator.stop()
      expect(await exists(join(root, '.writer.lock'))).toBe(true)
    } finally {await rm(root, {recursive: true, force: true})}
  })
  it('never clears legacy uncertainty even when corrected credentials would work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pb-legacy-uncertainty-'))
    try {
      const store = new JobStore(root)
      await store.markUncertain()
      const before = await readFile(join(root, '.uncertain-writes.json'), 'utf8')
      const corrected = await boot(root)
      expect(corrected.ready).toBe(false)
      expect(corrected.instances).toHaveLength(0)
      expect(corrected.coordinator.status().state).toBe('recovery-required')
      expect(await readFile(join(root, '.uncertain-writes.json'), 'utf8')).toBe(before)
      await corrected.coordinator.stop()
    } finally {await rm(root, {recursive: true, force: true})}
  })
  it('a forged handshake-shaped error cannot establish pre-mutation execution evidence', async () => {
    const {db} = await load()
    expect(db.isPreMutationInitializationFailure({data: {kind: 'database-handshake', scope: 'root', phase: 'authentication'}})).toBe(false)
    await db.shutdownDb()
  })
})
