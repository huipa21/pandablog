import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { Surreal } from 'surrealdb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { startFixture, type Fixture } from '../../scripts/backend-hardening/fixture'

// Opt-in ONLY through the owned harness; no fixed endpoint or credentials.
const enabled = process.env.PB_BACKEND_FIXTURE === '1'
let fixture: Fixture | undefined
const db = new Surreal()
vi.mock('../../server/utils/db', () => ({ useDb: async () => db, queryDb: async (_db: unknown, sql: string, params?: Record<string, unknown>) => db.query(sql, params) }))
const { writeErrorGroup, waitForErrorGroupWrites } = await import('../../server/utils/error-group-write')
const { bulkErrorGroups, listErrorGroups, readErrorGroup, retainErrorGroups, errorGroupListSchema } = await import('../../server/utils/error-groups')
const { runErrorGroupBackfill } = await import('../../server/utils/error-group-backfill')
const { errorFingerprint } = await import('../../server/utils/error-fingerprint')

const fp = errorFingerprint({ message: 'live failure', path: '/api/test', status: 500 })
const entry = { fingerprint: fp, name: 'Error', message: 'live failure', route: '/api/test', path: '/api/test', level: 'error', status_code: 500, timestamp: new Date(), request_id: 'live-request' }

describe.skipIf(!enabled)('isolated SurrealDB 3.2 error groups', () => {
  beforeAll(async () => {
    fixture = await startFixture({ enabled: process.env.PB_BACKEND_FIXTURE, binary: process.env.PB_BACKEND_SURREAL_BIN ?? '' })
    await db.connect(`${fixture.endpoint.replace('http:', 'ws:')}/rpc`)
    await db.signin({ username: fixture.username, password: fixture.password })
    await db.use({ namespace: fixture.namespace, database: fixture.database })
    const schema = readFileSync(new URL('../../server/utils/schema.surql', import.meta.url), 'utf8')
    await db.query(schema.slice(schema.indexOf('DEFINE TABLE OVERWRITE error_logs'), schema.indexOf('-- #module logs end', schema.indexOf('DEFINE TABLE OVERWRITE error_logs'))))
    await db.query('DEFINE TABLE app_settings SCHEMALESS;')
  })
  afterAll(async () => { try { await db.close() } finally { await fixture?.stop() } })

  it('counts 100 errors atomically, trims exact caps including timestamp ties, and regresses resolved groups', async () => {
    for (let index = 0; index < 100; index++) await writeErrorGroup(entry, 1, true)
    expect((await readErrorGroup(fp))?.group.count).toBe(100)
    const trimmed = await retainErrorGroups(new Date('2000-01-01'), 50)
    expect(trimmed).toEqual({ groups: 0, occurrences: 50 })
    expect((await readErrorGroup(fp))?.occurrences).toHaveLength(50)
    await bulkErrorGroups({ action: 'resolve', ids: [fp] })
    await writeErrorGroup(entry, 1, true)
    expect((await readErrorGroup(fp))?.group).toMatchObject({ count: 101, regressed: true })
    expect((await listErrorGroups(errorGroupListSchema.parse({}))).total).toBe(1)
    await bulkErrorGroups({ action: 'delete', ids: [fp] })
    expect(await readErrorGroup(fp)).toBeNull()
  }, 30_000)

  it('backfills 1409 legacy rows in pages, preserving read state and rerunning as a no-op', async () => {
    for (let index = 0; index < 1409; index += 100) {
      const rows = Array.from({ length: Math.min(100, 1409 - index) }, (_, offset) => ({
        id: `legacy${index + offset}`, timestamp: new Date('2025-01-01T00:00:00Z'),
        message: `legacy ${Math.floor((index + offset) / 200)} issue ${index + offset}`, level: 'error',
        path: '/api/legacy', read_at: new Date('2025-02-01T00:00:00Z')
      }))
      await db.query('INSERT INTO error_logs $rows;', { rows })
    }
    const result = await runErrorGroupBackfill(db)
    // All variable numbers normalize away: this is one synthetic bug.
    expect(result).toEqual({ migrated: 1409, groups: 1 })
    const list = await listErrorGroups(errorGroupListSchema.parse({ status: 'read' }))
    expect(list.total).toBe(1)
    expect(list.rows[0]?.count).toBe(1409)
    expect(await runErrorGroupBackfill(db)).toBeUndefined()
    const trimmed = await retainErrorGroups(new Date('2026-01-01'), 50)
    expect(trimmed).toEqual({ groups: 1, occurrences: 1409 })
  }, 30_000)

  it('handles concurrent writes without losing increments and aggregate-only counts', async () => {
    await Promise.all(Array.from({ length: 20 }, () => writeErrorGroup(entry, 1, true)))
    await writeErrorGroup(entry, 80, false)
    expect((await readErrorGroup(fp))?.group.count).toBe(100)
    expect((await readErrorGroup(fp))?.occurrences).toHaveLength(20)
    await bulkErrorGroups({ action: 'delete', ids: [fp] })
  }, 30_000)

  it('uses the real logError storm guard: 100 counts, only 20 samples, trailing timer/close flush', async () => {
    vi.stubEnv('LOG_CONSOLE', 'off')
    vi.stubGlobal('__PB_MODULE_LOGS__', true)
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: {} } }))
    const { logError, flushPendingErrorGroups } = await import('../../server/utils/logging')
    const error = new Error('rate guard live error')
    const fingerprint = errorFingerprint({ name: error.name, message: error.message, stack: error.stack, path: '/api/storm', status: 500 })
    for (let index = 0; index < 100; index++) logError(error, { path: '/api/storm', request_id: `request-${index}` })
    await flushPendingErrorGroups()
    await waitForErrorGroupWrites()
    const detail = await readErrorGroup(fingerprint)
    expect(detail?.group.count).toBe(100)
    expect(detail?.occurrences).toHaveLength(20)
    await bulkErrorGroups({ action: 'delete', ids: [fingerprint] })
    vi.unstubAllEnvs(); vi.unstubAllGlobals()
  }, 30_000)

  it('enforces cap=1 and deletes a single remaining occurrence', async () => {
    for (let index = 0; index < 3; index++) await writeErrorGroup(entry, 1, true)
    expect(await retainErrorGroups(new Date('2000-01-01'), 1)).toEqual({ groups: 0, occurrences: 2 })
    expect((await readErrorGroup(fp))?.occurrences).toHaveLength(1)
    expect(await bulkErrorGroups({ action: 'delete', ids: [fp] })).toMatchObject({ deleted: 1, deleted_occurrences: 1 })
  })

  it('queries 1K synthetic groups within the local 300ms target', async () => {
    for (let index = 0; index < 1000; index += 100) {
      const groups = Array.from({ length: 100 }, (_, offset) => ({ fingerprint: (index + offset).toString(16).padStart(16, '0'), fingerprint_version: 1, message: `bug ${index + offset}`, level: 'error', count: 1, first_seen: new Date(), last_seen: new Date(), regressed: false }))
      await db.query('INSERT INTO error_groups $groups;', { groups })
    }
    const start = performance.now()
    const result = await listErrorGroups(errorGroupListSchema.parse({}))
    const elapsed = performance.now() - start
    process.stderr.write(`Phase 3 local list: ${result.total} groups, ${elapsed.toFixed(1)}ms\n`)
    expect(result.total).toBe(1000)
    expect(elapsed).toBeLessThan(300)
  }, 30_000)
})
