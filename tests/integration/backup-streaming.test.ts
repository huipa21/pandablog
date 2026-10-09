import { Surreal } from 'surrealdb'
import { describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { startFixture, fixtureRss } from '../../scripts/backend-hardening/fixture'
import { writeSqlFixture } from '../../scripts/backend-hardening/generate'
import { exportSurrealDbToFile, importSurrealDb, runSqlHttp } from '../../server/utils/backups/surrealHttp'
import { validateDumpByStaging, verifySnapshot } from '../../server/utils/backups/validate'

const enabled = process.env.PB_BACKEND_FIXTURE === '1'
describe.skipIf(!enabled)('actual application streaming HTTP and replacement semantics', () => {
  it('a standalone full export preserves deleted rows and graph integrity without consolidation', async () => {
    const fixture = await startFixture({enabled: process.env.PB_BACKEND_FIXTURE, binary: process.env.PB_BACKEND_SURREAL_BIN ?? ''})
    const db = new Surreal()
    vi.stubGlobal('useRuntimeConfig', () => ({surrealUrl: `${fixture.endpoint}/rpc`, surrealRoot: fixture.username, surrealRootPassword: fixture.password, surrealNamespace: fixture.namespace, surrealDatabase: fixture.database}))
    try {
      await db.connect(`${fixture.endpoint.replace('http:', 'ws:')}/rpc`)
      await db.signin({username: fixture.username, password: fixture.password})
      await db.use({namespace: fixture.namespace, database: fixture.database})
      await db.query("DEFINE TABLE selected SCHEMALESS; DEFINE TABLE kept SCHEMALESS; CREATE selected:deleted SET title = 'base'; CREATE selected:retained SET title = 'base'; CREATE kept:retained SET title = 'base';")
      await db.query("DELETE selected:deleted; UPDATE selected:retained SET title = 'snapshot'; DEFINE TABLE graph_edge TYPE RELATION IN selected OUT kept; RELATE selected:retained->graph_edge->kept:retained;")
      const snapshot = fixture.storage.path('full.surql')
      await exportSurrealDbToFile(snapshot)
      const expected = await validateDumpByStaging(snapshot)
      expect(expected.selected?.count).toBe(1)
      expect(expected.kept?.sample).toContain('base')
      expect(expected.selected?.sample).toContain('snapshot')
      expect(expected.selected?.sample).not.toContain('deleted')
      expect(expected.graph_edge?.count).toBe(1)
      const target = `__pb_roundtrip_${randomBytes(12).toString('hex')}`
      await runSqlHttp(`DEFINE DATABASE ${target};`)
      await importSurrealDb(snapshot, target)
      await verifySnapshot(expected, target)
      await runSqlHttp(`REMOVE DATABASE ${target};`)
      // A full assertion still cannot bypass independent graph validation.
      await db.query('DELETE selected:retained; RELATE selected:missing->graph_edge->kept:retained;')
      const dangling = fixture.storage.path('dangling.surql')
      await exportSurrealDbToFile(dangling)
      await expect(validateDumpByStaging(dangling)).rejects.toThrow(/dangling/)
      // Explicit table selection remains a lower-level export transport contract,
      // not a supported backup mode: [] must never unexpectedly export all.
      const empty = fixture.storage.path('empty.surql')
      await exportSurrealDbToFile(empty, {tables: []})
      await expect(validateDumpByStaging(empty)).rejects.toThrow()
      process.stdout.write(JSON.stringify({evidence: 'REV-2.3-and-2.4-real-HTTP-replacement-not-production', node: process.version, sdk: '2.0.3', surreal: (await db.version()).version}) + '\n')
    } finally {vi.unstubAllGlobals(); await db.close(); await fixture.stop()}
  }, 90_000)

  it('streams a 96-MiB-class dump with separate sampled driver/DB memory', async () => {
    const fixture = await startFixture({enabled: process.env.PB_BACKEND_FIXTURE, binary: process.env.PB_BACKEND_SURREAL_BIN ?? ''})
    vi.stubGlobal('useRuntimeConfig', () => ({surrealUrl: `${fixture.endpoint}/rpc`, surrealRoot: fixture.username, surrealRootPassword: fixture.password, surrealNamespace: fixture.namespace, surrealDatabase: fixture.database}))
    const setup = new Surreal()
    await setup.connect(`${fixture.endpoint.replace('http:', 'ws:')}/rpc`)
    await setup.signin({username: fixture.username, password: fixture.password})
    await setup.use({namespace: fixture.namespace, database: fixture.database})
    await setup.query('DEFINE TABLE fixture_seed SCHEMALESS;')
    await setup.close()
    let stopped = false
    const before = process.memoryUsage(), beforeDb = await fixtureRss(fixture.pid)
    let peak = before.rss, peakDb = beforeDb, dbSamples = 0
    const timer = setInterval(() => {peak = Math.max(peak, process.memoryUsage().rss)}, 10)
    const sampler = (async () => {while (!stopped) {peakDb = Math.max(peakDb, await fixtureRss(fixture.pid)); dbSamples++; await new Promise(resolve => setTimeout(resolve, 100))}})()
    try {
      const source = fixture.storage.path('large.surql')
      const seed = await writeSqlFixture(fixture.storage, 'large.surql', {rows: 12_288, payloadBytes: 8192, chunkBytes: 64 * 1024})
      const started = performance.now()
      expect(await importSurrealDb(source)).toMatchObject({total: 0, errorCount: 0})
      const result = await runSqlHttp('SELECT count() AS total FROM fixture_seed GROUP ALL;') as {result: {total: number}[]}[]
      expect(result[0]?.result[0]?.total).toBe(seed.rows)
      const exportedBytes = await exportSurrealDbToFile(fixture.storage.path('exported.surql'))
      const elapsedMs = performance.now() - started
      stopped = true; clearInterval(timer); await sampler
      process.stdout.write(JSON.stringify({evidence: 'REV-2.3-owned-stream-driver-not-Nitro-or-constrained-production', node: process.version, sdk: '2.0.3', seed, exportedBytes, elapsedMs, before, after: process.memoryUsage(), sampledDriverPeakRss: peak, sampledDbPeakRss: peakDb, dbSamples, beforeDb}) + '\n')
    } finally {stopped = true; clearInterval(timer); await sampler; vi.unstubAllGlobals(); await fixture.stop()}
  }, 180_000)
})
