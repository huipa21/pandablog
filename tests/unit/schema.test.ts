import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applySchema, loadSchema, stripModuleSchemaSections } from '../../server/utils/schema'

const mocks = vi.hoisted(() => ({ queryDb: vi.fn() }))
vi.mock('../../server/utils/db', () => mocks)
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('__PB_MODULE_LOGS__', true)
  vi.stubGlobal('__PB_MODULE_ANALYTICS__', true)
  vi.stubGlobal('__PB_MODULE_BACKUPS__', true)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const fixture = 'base\n-- #module logs start\naccess\n-- #module logs end\n' +
  '-- #module analytics start\nanalytics\n-- #module analytics end\n' +
  '-- #module logs start\nerrors\n-- #module logs end\n'

describe('shared schema application', () => {
  it('strips every disabled module section, retaining enabled sections and base schema', () => {
    expect(stripModuleSchemaSections(fixture, { logs: false, analytics: true })).toBe(
      'base\n-- #module analytics start\nanalytics\n-- #module analytics end\n'
    )
    expect(stripModuleSchemaSections(fixture.replace(/\n/g, '\r\n'), { logs: false, analytics: false })).toBe('base\r\n')
    expect(stripModuleSchemaSections(fixture, { logs: true, analytics: true })).toBe(fixture)
  })
  it('loads the real schema and hashes exactly the module-filtered SQL', async () => {
    const raw = await readFile('server/utils/schema.surql', 'utf8')
    const loaded = await loadSchema()
    expect(loaded.schema).toBe(raw)
    expect(loaded.hash).toBe(createHash('sha256').update(raw).digest('hex'))
    expect(loaded.schema).not.toContain('access_logs')
    expect(loaded.schema).toContain('DEFINE TABLE OVERWRITE activity_logs SCHEMAFULL')
  })
  it('does not recreate log tables in a logs-disabled build', async () => {
    vi.stubGlobal('__PB_MODULE_LOGS__', false)
    vi.stubGlobal('__PB_MODULE_ANALYTICS__', false)
    const loaded = await loadSchema()
    expect(loaded.schema).not.toMatch(/DEFINE TABLE OVERWRITE (access_logs|activity_logs|error_logs|pageview)/)
    expect(loaded.schema).toContain('DEFINE TABLE OVERWRITE backups')
    expect(loaded.hash).toBe(createHash('sha256').update(loaded.schema).digest('hex'))
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
