import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { platform, release, totalmem } from 'node:os'
import { join } from 'node:path'
import { Surreal } from 'surrealdb'
import { describe, expect, it } from 'vitest'
import { assertSurrealVersion, fixtureRss, startFixture } from '../../scripts/backend-hardening/fixture'
import { writeSqlFixture } from '../../scripts/backend-hardening/generate'
import { importFixture } from '../../scripts/backend-hardening/http'

const enabled = process.env.PB_BACKEND_FIXTURE === '1'

describe.skipIf(!enabled)('owned stable SurrealDB 3.2.x SDK / HTTP fixture acceptance', () => {
  it('starts/stops twice with fresh targets, commits/rolls back and imports streamed SQL', async () => {
    const identities = new Set<string>()
    const versions: Record<string, string> = {}
    for (const name of ['surrealdb', 'nuxt', 'sharp']) {
      const pkg = JSON.parse(await readFile(new URL(`../../node_modules/${name}/package.json`, import.meta.url), 'utf8'))
      versions[name] = pkg.version
    }
    for (let cycle = 1; cycle <= 2; cycle++) {
      const fixture = await startFixture({ enabled: process.env.PB_BACKEND_FIXTURE, binary: process.env.PB_BACKEND_SURREAL_BIN ?? '' })
      const db = new Surreal()
      try {
        expect(identities.has(fixture.database)).toBe(false)
        identities.add(fixture.database)
        await db.connect(`${fixture.endpoint.replace('http:', 'ws:')}/rpc`)
        await db.signin({ username: fixture.username, password: fixture.password })
        await db.use({ namespace: fixture.namespace, database: fixture.database })
        const idle = { driver: process.memoryUsage(), dbRss: await fixtureRss(fixture.pid) }
        const { version } = await db.version()
        assertSurrealVersion(version)
        await db.query('BEGIN TRANSACTION; CREATE fixture_txn:committed SET value = 42; COMMIT TRANSACTION;')
        // SDK 2 reports the cancelled statement as a QueryError. Assert the
        // known cancellation response AND independently prove rollback below.
        await expect(db.query('BEGIN TRANSACTION; CREATE fixture_txn:cancelled SET value = 99; CANCEL TRANSACTION;')).rejects.toThrow(/cancelled transaction/)
        const rows = await db.query<[Array<{ value: number }>]>('SELECT * FROM fixture_txn;')
        expect(rows[0]).toHaveLength(1)
        expect(rows[0]![0]!.value).toBe(42)
        const start = performance.now()
        const seed = await writeSqlFixture(fixture.storage, 'seed.surql', { rows: 25, payloadBytes: 128, chunkBytes: 1024 })
        const returnedStatements = await importFixture(fixture, 'seed.surql')
        const counts = await db.query<[Array<{ total: number }>]>('SELECT count() AS total FROM fixture_seed GROUP ALL;')
        assert.equal(counts[0]?.[0]?.total, 25)
        expect(returnedStatements).toBe(0) // OPTION IMPORT suppresses result output.
        const imported = await db.query<[Array<{ ordinal: number, payload: string }>]>(
          'SELECT ordinal, payload FROM fixture_seed ORDER BY ordinal LIMIT 26;'
        )
        expect(imported[0]?.map(row => row.ordinal)).toEqual(Array.from({ length: 25 }, (_, index) => index))
        expect(imported[0]?.every(row => row.payload === 'x'.repeat(128))).toBe(true)
        process.stdout.write(JSON.stringify({ evidence: 'local-fixture-not-app-or-production', cycle, node: process.version, surreal: version, versions, os: `${platform()} ${release()}`, hostMemoryBytes: totalmem(), idle, seed, returnedStatements, elapsedMs: performance.now() - start, after: { driver: process.memoryUsage(), dbRss: await fixtureRss(fixture.pid) } }) + '\n')
      } finally { try { await db.close() } finally { await fixture.stop(); await fixture.stop() } }
      await expect(readFile(join(fixture.storage.root, '.owner'))).rejects.toThrow()
      expect(() => fixture.storage.path('.owner')).toThrow()
    }
  }, 120_000)
})
