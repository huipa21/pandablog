import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootstrapCredentials, databaseIdentifier, validateStartupConfig } from '../../server/utils/startup-config'

const configuration = () => ({surrealUrl: 'ws://fixture.invalid/rpc', surrealNamespace: 'fixture_ns', surrealDatabase: 'fixture_db', surrealRoot: 'fixture_root', surrealRootPassword: 'root-fixture-secret', surrealAppUser: 'fixture_app', surrealAppPassword: 'app-fixture-secret', session: {password: 'fixture-session-32-plus-characters'}, appOrigin: 'http://127.0.0.1:3000', public: {footerShowPoweredBy: false}})
async function load(failProvision = false, failScopedAuthentication = false, failRootClose = false, failHandshakePhase?: 'connection' | 'authentication' | 'selection') {
  vi.resetModules()
  const config = configuration(), events: string[] = []
  const instances: {signin: ReturnType<typeof vi.fn>, query: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn>}[] = []
  vi.doMock('surrealdb', () => ({Surreal: class {
    id = instances.length
    connect = vi.fn(async () => {if (failHandshakePhase === 'connection') throw new Error('root-fixture-secret endpoint SQL cause')})
    signin = vi.fn(async (identity: object) => {
      events.push(`signin:${this.id}`)
      if (failHandshakePhase === 'authentication') throw new Error('root-fixture-secret endpoint SQL cause')
      if (failScopedAuthentication && 'namespace' in identity) throw new Error('synthetic scoped authentication cause')
    })
    use = vi.fn(async () => {if (failHandshakePhase === 'selection') throw new Error('root-fixture-secret endpoint SQL cause')})
    query = vi.fn(async (sql: string, _params?: Record<string, unknown>) => {
      events.push(`query:${this.id}`)
      if (failProvision && sql.startsWith('DEFINE USER')) throw new Error('synthetic SQL password cause')
      return [[]]
    })
    close = vi.fn(async () => {
      events.push(`close:${this.id}`)
      if (failRootClose && this.id === 0) throw new Error('synthetic close failure')
    })
    constructor() {instances.push(this)}
  }}))
  vi.stubGlobal('useRuntimeConfig', () => config)
  const db = await import('../../server/utils/db')
  return {config, events, instances, ...db}
}
afterEach(() => {vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.doUnmock('surrealdb'); vi.restoreAllMocks()})

describe('ROOT-only provisioning followed by scoped schema authority', () => {
  it('creates namespace/database/user, disposes ROOT, then authenticates scoped schema work', async () => {
    const db = await load()
    const scoped = await db.initializeRuntimeDatabase()
    expect(db.instances).toHaveLength(2)
    expect(db.instances[0]!.signin).toHaveBeenCalledExactlyOnceWith({username: db.config.surrealRoot, password: db.config.surrealRootPassword})
    expect(db.instances[0]!.query.mock.calls.map(call => call[0])).toEqual([
      'DEFINE NAMESPACE IF NOT EXISTS `fixture_ns`; DEFINE DATABASE IF NOT EXISTS `fixture_db`;',
      expect.stringMatching(/^DEFINE USER IF NOT EXISTS fixture_app ON DATABASE .* ROLES EDITOR;$/)
    ])
    expect(db.events.indexOf('close:0')).toBeLessThan(db.events.indexOf('signin:1'))
    await db.queryDb(scoped, 'DEFINE TABLE fixture_schema SCHEMAFULL;')
    expect(db.instances[1]!.query).toHaveBeenCalledWith('DEFINE TABLE fixture_schema SCHEMAFULL;', undefined)
    expect(db.instances[0]!.query).toHaveBeenCalledTimes(2)
    await db.shutdownDb()
  })
  it('keeps overwrite restricted to explicit privileged credential refresh', async () => {
    const db = await load()
    const root = await db.connectRootClient()
    await db.provisionAppDatabaseUser(root)
    expect(db.instances[0]!.query.mock.calls[0]?.[0]).toMatch(/^DEFINE USER OVERWRITE fixture_app ON DATABASE/)
    await db.closeRootClient(root)
    await db.shutdownDb()
  })
  it('restarts without ROOT configuration and never uses ROOT again for schema/query/reconnect', async () => {
    const db = await load()
    await db.initializeRuntimeDatabase()
    db.config.surrealRoot = ''; db.config.surrealRootPassword = ''
    await db.recycleRuntimeConnection()
    const scoped = await db.initializeRuntimeDatabase()
    expect(db.instances).toHaveLength(3)
    expect(db.instances[2]!.signin).toHaveBeenCalledExactlyOnceWith({namespace: 'fixture_ns', database: 'fixture_db', username: 'fixture_app', password: db.config.surrealAppPassword})
    await db.queryDb(scoped, 'DEFINE TABLE restart_schema SCHEMALESS;')
    expect(db.instances[0]!.query).toHaveBeenCalledTimes(2)
    await expect(db.connectRootClient()).rejects.toThrow('ROOT credentials are required')
    expect(db.instances).toHaveLength(3)
    await db.shutdownDb()
  })
  it('does not start scoped schema work after failed provisioning and safely disposes ROOT', async () => {
    const db = await load(true)
    await expect(db.initializeRuntimeDatabase()).rejects.toThrow('Could not provision')
    expect(db.instances).toHaveLength(1)
    expect(db.instances[0]!.close).toHaveBeenCalledOnce()
    await db.shutdownDb()
  })
  it('never retries scoped authentication failure as ROOT after explicit bootstrap', async () => {
    const db = await load(false, true)
    await expect(db.initializeRuntimeDatabase()).rejects.toThrow('Database handshake failed')
    expect(db.instances).toHaveLength(2)
    expect(db.instances[0]!.close).toHaveBeenCalledOnce()
    expect(db.instances[1]!.close).toHaveBeenCalledOnce()
    expect(db.instances[0]!.signin).toHaveBeenCalledOnce()
    await db.shutdownDb()
  })
  it.each(['connection', 'authentication', 'selection'] as const)('reports the exact ROOT handshake %s stage without exposing the SDK cause', async phase => {
    const db = await load(false, false, false, phase)
    const error = await db.initializeRuntimeDatabase().catch(error => error)
    expect(error).toMatchObject({statusCode: 503, data: {kind: 'database-handshake', scope: 'root', phase}})
    expect(error.message).toBe(`Database handshake failed (root ${phase})`)
    expect(JSON.stringify(error)).not.toMatch(/root-fixture-secret|endpoint SQL cause/)
    expect(db.instances).toHaveLength(1)
    expect(db.instances[0]!.query).not.toHaveBeenCalled()
    expect(db.instances[0]!.close).toHaveBeenCalledOnce()
    await db.shutdownDb()
  })
  it('a failed ROOT close() is terminated and released, counted as connectivity, never retained as a stuck client', async () => {
    const db = await load(false, false, true)
    const before = db.databaseConnectivityFailureCount()
    await db.initializeRuntimeDatabase()
    // ROOT closed (even though close() rejected) before the scoped runtime client exists.
    expect(db.instances).toHaveLength(2)
    expect(db.instances[0]!.close).toHaveBeenCalled()
    expect(db.databaseDiagnostics().ownedClients).toBe(1) // only the runtime client
    expect(db.databaseConnectivityFailureCount()).toBeGreaterThan(before)
    await db.shutdownDb()
  })
  it('fails scoped-only restart authentication without ever constructing ROOT', async () => {
    const db = await load(false, true)
    db.config.surrealRootPassword = ''
    await expect(db.initializeRuntimeDatabase()).rejects.toMatchObject({message: 'Database handshake failed (database authentication)', data: {kind: 'database-handshake', scope: 'database', phase: 'authentication'}})
    expect(db.instances).toHaveLength(1)
    expect(db.instances[0]!.signin).toHaveBeenCalledWith(expect.objectContaining({namespace: 'fixture_ns', database: 'fixture_db'}))
    await db.shutdownDb()
  })
  it('supports optional ROOT startup config while keeping scoped credentials mandatory', () => {
    const config = configuration()
    config.surrealRoot = ''; config.surrealRootPassword = ''
    vi.stubGlobal('useRuntimeConfig', () => config)
    expect(validateStartupConfig).not.toThrow()
    expect(bootstrapCredentials(config)).toBeUndefined()
    config.surrealAppPassword = ''
    expect(validateStartupConfig).toThrow('scoped SurrealDB runtime credentials')
    config.surrealAppPassword = 'fixture-app'
    config.surrealRootPassword = 'fixture-root'
    expect(validateStartupConfig).toThrow('ROOT credentials are required')
  })
  it('validates namespace/database identifiers before privileged SQL interpolation', () => {
    expect(databaseIdentifier('fixture-db', 'database')).toBe('`fixture-db`')
    for (const value of ['a`; REMOVE NAMESPACE main;', '', 'name\\escape', 'a'.repeat(129)]) expect(() => databaseIdentifier(value, 'database')).toThrow('supported database identifier')
  })
  it('rejects privileged HTTP maintenance without ROOT before any network request', async () => {
    const config = configuration()
    config.surrealRoot = ''; config.surrealRootPassword = ''
    vi.stubGlobal('useRuntimeConfig', () => config)
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const {runSqlHttp} = await import('../../server/utils/backups/surrealHttp')
    await expect(runSqlHttp('INFO FOR DB;')).rejects.toThrow('ROOT credentials are required')
    expect(fetch).not.toHaveBeenCalled()
  })
})
