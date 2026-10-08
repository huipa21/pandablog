import { afterEach, describe, expect, it, vi } from 'vitest'

/** Mock of SurrealDB SDK 2.0.3 outage behaviour (verified against the real
 * driver): connect() to an unreachable server never settles (it only emits
 * "disconnected"), and calls pending when close() is invoked never settle. */
interface Behaviour { unreachable: boolean, blackHole: boolean, unavailable: boolean }
async function load(behaviour: Behaviour) {
  vi.resetModules()
  const instances: {close: ReturnType<typeof vi.fn>, connectOptions?: unknown}[] = []
  vi.doMock('surrealdb', () => ({Surreal: class {
    listeners = new Map<string, Set<() => void>>()
    connectOptions?: unknown
    subscribe(event: string, listener: () => void) {
      const set = this.listeners.get(event) ?? new Set()
      this.listeners.set(event, set); set.add(listener)
      return () => set.delete(listener)
    }
    emit(event: string) {for (const listener of this.listeners.get(event) ?? []) listener()}
    connect = vi.fn((_url: string, options?: unknown) => {
      this.connectOptions = options
      if (!behaviour.unreachable) return Promise.resolve(true)
      setTimeout(() => this.emit('disconnected'), 5)
      return new Promise(() => {}) // never settles, like the real driver
    })
    signin = vi.fn().mockResolvedValue(undefined)
    use = vi.fn().mockResolvedValue(undefined)
    query = vi.fn(() => {
      if (behaviour.unavailable) {
        const error = new Error('You must be connected to a SurrealDB instance before performing this operation')
        error.name = 'ConnectionUnavailableError'
        return Promise.reject(error)
      }
      return behaviour.blackHole ? new Promise(() => {}) : Promise.resolve([[]])
    })
    close = vi.fn().mockResolvedValue(true)
    constructor() {instances.push(this as never)}
  }}))
  vi.stubGlobal('useRuntimeConfig', () => ({surrealUrl: 'ws://fixture.invalid/rpc', surrealNamespace: 'fixture', surrealDatabase: 'fixture', surrealRoot: 'root', surrealRootPassword: '', surrealAppUser: 'fixture_app', surrealAppPassword: 'synthetic-app'}))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const db = await import('../../server/utils/db')
  const {writeBarrier} = await import('../../server/utils/maintenance')
  return {db, barrier: writeBarrier, instances}
}
afterEach(() => {vi.unstubAllGlobals(); vi.doUnmock('surrealdb'); vi.restoreAllMocks()})

describe('database client behaviour during network outages (SDK 2.0.3 semantics)', () => {
  it('disables driver reconnect (which would replay in-flight writes)', async () => {
    const {db, instances} = await load({unreachable: false, blackHole: false, unavailable: false})
    await db.useDb()
    expect(instances[0]!.connectOptions).toEqual({reconnect: {enabled: false}})
    await db.shutdownDb()
  })

  it('fails an unreachable handshake fast and never exhausts the client budget', async () => {
    const {db} = await load({unreachable: true, blackHole: false, unavailable: false})
    for (let attempt = 0; attempt < 8; attempt++) {
      const started = Date.now()
      await expect(db.useDb()).rejects.toMatchObject({data: {kind: 'database-handshake', phase: 'connection'}})
      expect(Date.now() - started).toBeLessThan(2_000)
      expect(db.databaseDiagnostics().ownedClients).toBe(0)
      await db.recycleRuntimeConnection() // clear reconnect backoff
    }
    expect(db.databaseConnectivityFailureCount()).toBeGreaterThanOrEqual(8)
    await db.shutdownDb()
  })

  it('closing a client settles its stuck in-flight calls, releasing leases and marking writes uncertain', async () => {
    const {db, barrier} = await load({unreachable: false, blackHole: true, unavailable: false})
    const client = await db.useDb()
    const write = db.queryDb(client, 'UPDATE fixture SET n += 1;', undefined, {timeoutMs: 20})
    await expect(write).rejects.toMatchObject({statusCode: 504})
    expect(barrier.status().active).toBe(1) // response deadline is not cancellation
    await db.recycleRuntimeConnection() // e.g. failed keepalive probe closes the socket
    await vi.waitFor(() => expect(barrier.status().active).toBe(0))
    expect(barrier.status().uncertainWrites).toBeGreaterThan(0)
    expect(db.databaseDiagnostics().foreground.active).toBe(0)
    await db.shutdownDb()
  })

  it('shutdown settles calls stuck on a black-holed network instead of hanging', async () => {
    const {db, barrier} = await load({unreachable: false, blackHole: true, unavailable: false})
    const client = await db.useDb()
    void db.queryDb(client, 'SELECT * FROM fixture;', undefined, {timeoutMs: 20, retry: 'readOnly'}).catch(() => {})
    await new Promise(resolve => setTimeout(resolve, 30))
    const started = Date.now()
    await db.shutdownDb()
    expect(Date.now() - started).toBeLessThan(4_000)
    await vi.waitFor(() => expect(barrier.status().active).toBe(0))
    expect(db.databaseDiagnostics().ownedClients).toBe(0)
  })

  it('a write rejected before it was sent (ConnectionUnavailableError) is not uncertain', async () => {
    const {db, barrier} = await load({unreachable: false, blackHole: false, unavailable: true})
    const client = await db.useDb()
    await expect(db.queryDb(client, 'UPDATE fixture SET n += 1;')).rejects.toMatchObject({statusCode: 503})
    expect(barrier.status().uncertainWrites).toBe(0)
    await db.shutdownDb()
  })
})
