import { Surreal } from 'surrealdb'
import { describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { startFixture, fixtureRss } from '../../scripts/backend-hardening/fixture'
import { writeSqlFixture } from '../../scripts/backend-hardening/generate'
import { exportSurrealDbToFile, importSurrealDb, runSqlHttp } from '../../server/utils/backups/surrealHttp'
import { consolidateDumps, validateDumpByStaging, verifySnapshot } from '../../server/utils/backups/validate'

const enabled = process.env.PB_BACKEND_FIXTURE === '1'
describe.skipIf(!enabled)('actual application streaming HTTP and replacement semantics', () => {
  it('selected-table deletion stays deleted; nonselected base rows survive; [] selects nothing', async () => {
    const fixture = await startFixture({enabled: process.env.PB_BACKEND_FIXTURE, binary: process.env.PB_BACKEND_SURREAL_BIN ?? ''})
    const db = new Surreal()
    vi.stubGlobal('useRuntimeConfig', () => ({surrealUrl: `${fixture.endpoint}/rpc`, surrealRoot: fixture.username, surrealRootPassword: fixture.password, surrealNamespace: fixture.namespace, surrealDatabase: fixture.database}))
    try {
      await db.connect(`${fixture.endpoint.replace('http:', 'ws:')}/rpc`)
      await db.signin({username: fixture.username, password: fixture.password})
      await db.use({namespace: fixture.namespace, database: fixture.database})
      await db.query("DEFINE TABLE selected SCHEMALESS; DEFINE TABLE kept SCHEMALESS; CREATE selected:deleted SET title = 'base'; CREATE selected:retained SET title = 'base'; CREATE kept:retained SET title = 'base';")
      const base = fixture.storage.path('base.surql'), partial = fixture.storage.path('partial.surql'), merged = fixture.storage.path('merged.surql'), empty = fixture.storage.path('empty.surql'), unchanged = fixture.storage.path('unchanged.surql')
      await exportSurrealDbToFile(base)
      await db.query("DELETE selected:deleted; UPDATE selected:retained SET title = 'partial'; UPDATE kept:retained SET title = 'later-but-not-selected';")
      await exportSurrealDbToFile(partial, {tables: ['selected']})
      await consolidateDumps(base, partial, ['selected'], merged)
      const expected = await validateDumpByStaging(merged)
      expect(expected.selected?.count).toBe(1)
      expect(expected.kept?.sample).toContain('base')
      expect(expected.selected?.sample).toContain('partial')
      expect(expected.selected?.sample).not.toContain('deleted')
      const target = `__pb_roundtrip_${randomBytes(12).toString('hex')}`
      await runSqlHttp(`DEFINE DATABASE ${target};`)
      await importSurrealDb(merged, target)
      await verifySnapshot(expected, target)
      await runSqlHttp(`REMOVE DATABASE ${target};`)
      await exportSurrealDbToFile(empty, {tables: []})
      await consolidateDumps(base, empty, [], unchanged)
      expect((await validateDumpByStaging(unchanged)).selected?.count).toBe(2)
      // Omitting related graph tables is rejected instead of resurrecting or
      // silently deleting references. This executes record::exists on real rows.
      await db.query('DEFINE TABLE graph_edge TYPE RELATION IN selected OUT kept; RELATE selected:retained->graph_edge->kept:retained;')
      const graphBase = fixture.storage.path('graph-base.surql'), graphPartial = fixture.storage.path('graph-partial.surql')
      await exportSurrealDbToFile(graphBase)
      await db.query('DELETE graph_edge; DELETE selected:retained;')
      await exportSurrealDbToFile(graphPartial, {tables: ['selected']})
      await expect(consolidateDumps(graphBase, graphPartial, ['selected'], fixture.storage.path('must-not-publish.surql'))).rejects.toThrow()
      await exportSurrealDbToFile(fixture.storage.path('graph-complete.surql'), {tables: ['selected', 'graph_edge']})
      await consolidateDumps(graphBase, fixture.storage.path('graph-complete.surql'), ['selected', 'graph_edge'], fixture.storage.path('graph-merged.surql'))
      expect((await validateDumpByStaging(fixture.storage.path('graph-merged.surql'))).graph_edge?.count).toBe(0)
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
