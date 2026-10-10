import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applySchema, loadSchema } from '../../server/utils/schema'

const mocks = vi.hoisted(() => ({ queryDb: vi.fn() }))
vi.mock('../../server/utils/db', () => mocks)
beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('shared schema application', () => {
  it('loads the complete real schema and hashes exactly the raw SQL (unchanged hash for existing installs)', async () => {
    const raw = await readFile('server/utils/schema.surql', 'utf8')
    const loaded = await loadSchema()
    expect(loaded.schema).toBe(raw)
    expect(loaded.hash).toBe(createHash('sha256').update(raw).digest('hex'))
    expect(loaded.schema).not.toContain('access_logs')
    expect(loaded.schema).toContain('DEFINE TABLE OVERWRITE activity_logs SCHEMAFULL')
    expect(loaded.schema).toContain('DEFINE TABLE OVERWRITE analytics_session')
    expect(loaded.schema).toContain('DEFINE TABLE OVERWRITE backups')
  })
  it('reuses the compatibility field reset before applying SQL on the supplied connection', async () => {
    const db = {} as Parameters<typeof applySchema>[0]
    await applySchema(db)
    expect(mocks.queryDb).toHaveBeenCalledTimes(2)
    expect(mocks.queryDb.mock.calls[0]![3].label).toBe('post stats field reset')
    expect(mocks.queryDb.mock.calls[1]).toEqual([db, (await loadSchema()).schema, undefined, {
      label: 'schema initialization', timeoutMs: 30_000, retryOnReconnect: false
    }])
  })
  it('can apply the already-loaded schema from boot without reading it again', async () => {
    await applySchema({} as Parameters<typeof applySchema>[0], 'boot SQL')
    expect(mocks.queryDb.mock.calls[1]![1]).toBe('boot SQL')
  })
  it('surfaces schema failure (so restore can roll back) while retaining reset compatibility', async () => {
    mocks.queryDb.mockRejectedValueOnce(new Error('post does not exist'))
      .mockRejectedValueOnce(new Error('schema failure'))
    await expect(applySchema({} as Parameters<typeof applySchema>[0], 'SQL')).rejects.toThrow('schema failure')
  })
})
