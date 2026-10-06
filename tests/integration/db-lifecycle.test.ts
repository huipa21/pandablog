import { Surreal } from 'surrealdb'
import { describe, expect, it, vi } from 'vitest'
import { startFixture } from '../../scripts/backend-hardening/fixture'
import { connectRootClient, closeRootClient, provisionAppDatabaseUser, queryDb, shutdownDb, useDb } from '../../server/utils/db'
import { wipeDatabase } from '../../server/utils/backups/registry'

// Actual application lifecycle and installed SDK. Only the generated config is injected.
describe.skipIf(process.env.PB_BACKEND_FIXTURE !== '1')('real database lifecycle, privileges and deadlines', () => {
  it('keeps DATABASE EDITOR separate from ROOT; observes residual execution and server TIMEOUT', async () => {
    const fixture = await startFixture({ enabled: process.env.PB_BACKEND_FIXTURE, binary: process.env.PB_BACKEND_SURREAL_BIN ?? '' })
    vi.stubGlobal('useRuntimeConfig', () => ({ surrealUrl: `${fixture.endpoint.replace('http:', 'ws:')}/rpc`, surrealRoot: fixture.username, surrealRootPassword: fixture.password, surrealNamespace: fixture.namespace, surrealDatabase: fixture.database, surrealAppUser: 'fixture_editor', surrealAppPassword: 'generated-for-owned-fixture-only' }))
    let root: Surreal | undefined
    try {
      root = await connectRootClient()
      await queryDb(root, 'DEFINE TABLE fixture SCHEMALESS; DEFINE TABLE wiped SCHEMALESS; DEFINE PARAM $fixture VALUE "synthetic"; DEFINE FUNCTION fn::fixture() { RETURN "synthetic"; }; DEFINE ANALYZER fixture TOKENIZERS blank;')
      expect(await provisionAppDatabaseUser(root)).toBe(true)
      const runtime = await useDb()
      await queryDb(runtime, "CREATE fixture:first SET payload = 'synthetic';")
      expect((await queryDb(runtime, 'SELECT * FROM fixture;'))[0]).toHaveLength(1)
      const matrix: Record<string, boolean> = {}
      for (const [label, sql] of Object.entries({ info: 'INFO FOR DB;', schema: 'DEFINE TABLE editor_schema SCHEMALESS;', user: "DEFINE USER other ON DATABASE PASSWORD 'synthetic' ROLES VIEWER;", database: 'DEFINE DATABASE other;' })) {
        try { await runtime.query(sql); matrix[label] = true } catch { matrix[label] = false }
      }
      expect(matrix.info).toBe(true)
      expect(matrix.user).toBe(false)
      expect(matrix.database).toBe(false)
      // No per-raw-query AbortSignal/cancel API in SDK 2.0.3. A response-only
      // deadline cannot imply rollback: the late CREATE actually persists.
      await expect(queryDb(root, 'SLEEP 100ms; CREATE fixture:late SET payload = "late";', undefined, { timeoutMs: 10 })).rejects.toMatchObject({ statusCode: 504, data: { uncertain: true } })
      await new Promise(resolve => setTimeout(resolve, 200))
      expect((await queryDb(root, 'SELECT * FROM fixture:late;'))[0]).toHaveLength(1)
      const bounded = await root.query('SELECT * FROM array::range(0, 100000) TIMEOUT 1ns;').responses()
      expect(bounded.some(response => !response.success)).toBe(true)
      await wipeDatabase()
      const info = (await queryDb(root, 'INFO FOR DB;'))[0] as { tables: object }
      expect(Object.keys(info.tables)).toHaveLength(0)
      // The same scoped credentials remain usable after privileged wipe.
      expect(await queryDb(runtime, 'RETURN 1;')).toEqual([1])
      process.stdout.write(JSON.stringify({ evidence: 'REV-2.1-owned-real-SDK-DB-not-production', node: process.version, sdk: '2.0.3', surreal: (await root.version()).version, permissions: matrix, deadline: 'response-only-late-write-persists; explicit-SELECT-TIMEOUT-fails' }) + '\n')
    } finally { await closeRootClient(root); await shutdownDb(); vi.unstubAllGlobals(); await fixture.stop() }
  }, 90_000)
})
