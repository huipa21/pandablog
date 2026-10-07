import { describe, expect, it, vi } from 'vitest'
import { startFixture } from '../../scripts/backend-hardening/fixture'

describe.skipIf(process.env.PB_BACKEND_FIXTURE !== '1')('real ROOT bootstrap then scoped full schema and ROOT-free restart', () => {
  it('creates only the target/user with ROOT and applies actual full schema through DATABASE EDITOR', async () => {
    const fixture = await startFixture({enabled: process.env.PB_BACKEND_FIXTURE, binary: process.env.PB_BACKEND_SURREAL_BIN ?? ''})
    vi.resetModules()
    const config = {surrealUrl: `${fixture.endpoint.replace('http:', 'ws:')}/rpc`, surrealNamespace: fixture.namespace, surrealDatabase: fixture.database,
      surrealRoot: fixture.username, surrealRootPassword: fixture.password, surrealAppUser: 'fixture_schema_editor', surrealAppPassword: 'fixture-quote"back\\secret',
      session: {password: 'synthetic-session-key-32-plus-characters'}, appOrigin: 'http://127.0.0.1:3000', public: {footerShowPoweredBy: false}}
    vi.stubGlobal('useRuntimeConfig', () => config)
    for (const flag of ['__PB_MODULE_LOGS__', '__PB_MODULE_ANALYTICS__', '__PB_MODULE_BACKUPS__']) vi.stubGlobal(flag, true)
    const db = await import('../../server/utils/db')
    const {validateStartupConfig} = await import('../../server/utils/startup-config')
    const {applySchema, loadSchema} = await import('../../server/utils/schema')
    try {
      validateStartupConfig()
      let scoped = await db.initializeRuntimeDatabase()
      const initial = (await db.queryDb(scoped, 'INFO FOR DB;'))[0] as {tables: Record<string, unknown>}
      expect(Object.keys(initial.tables)).toHaveLength(0) // ROOT made no tables
      expect(db.databaseDiagnostics().ownedClients).toBe(1) // only scoped remains
      const {schema} = await loadSchema()
      await applySchema(scoped, schema)
      const info = (await db.queryDb(scoped, 'INFO FOR DB;'))[0] as {tables: Record<string, unknown>}
      for (const table of ['users', 'post', 'files', 'app_settings']) expect(info.tables).toHaveProperty(table)
      await db.queryDb(scoped, "UPSERT app_settings:fixture_bootstrap SET key = 'fixture_bootstrap', value = 'scoped';")
      // Keeping ROOT for backup/restore must not rotate/reprovision an existing
      // scoped account on every normal boot, even if config supplied a typo.
      const originalPassword = config.surrealAppPassword
      config.surrealAppPassword = 'incorrect-fixture-password'
      await db.recycleRuntimeConnection()
      await expect(db.initializeRuntimeDatabase()).rejects.toThrow('Database handshake failed')
      config.surrealAppPassword = originalPassword
      await db.recycleRuntimeConnection()
      scoped = await db.initializeRuntimeDatabase() // original credentials still work
      expect((await db.queryDb(scoped, 'SELECT * FROM app_settings:fixture_bootstrap;'))[0]).toHaveLength(1)
      // Removing ROOT remains an optional normal-start capability, not the
      // recommended full-feature config when current privileged backups are used.
      config.surrealRoot = ''; config.surrealRootPassword = ''
      validateStartupConfig()
      await db.recycleRuntimeConnection()
      scoped = await db.initializeRuntimeDatabase()
      await applySchema(scoped, schema)
      expect((await db.queryDb(scoped, 'SELECT * FROM app_settings:fixture_bootstrap;'))[0]).toHaveLength(1)
      await expect(db.connectRootClient()).rejects.toThrow('ROOT credentials are required')
      const version = (await scoped.version()).version
      await expect(db.queryDb(scoped, "DEFINE USER other ON DATABASE PASSWORD 'fixture-only' ROLES VIEWER;")).rejects.toThrow()
      // The existing authorization-rejection policy discards that scoped
      // socket; it never retries the privileged script or downgrades to ROOT.
      process.stdout.write(JSON.stringify({evidence: 'RSC-ROOT-bootstrap-scoped-full-schema-owned-DB-not-Nuxt-production', node: process.version,
        sdk: '2.0.3', surreal: version, rootTables: 0, scopedTables: Object.keys(info.tables).length, rootFreeReconnect: true, existingUserPreservedWithRootConfigured: true}) + '\n')
    } finally {await db.shutdownDb(); vi.unstubAllGlobals(); await fixture.stop()}
  }, 90_000)
})
