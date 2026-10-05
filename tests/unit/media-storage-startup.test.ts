import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'

import { assertMediaStorageCompatible, ensureMediaStorageVersion, MEDIA_STORAGE_VERSION } from '../../server/utils/media-storage-migration'

const query = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/db', () => ({ queryDb: query }))

function fixture(marker: unknown, hasFiles: boolean) {
  const writes: string[] = []
  query.mockImplementation(async (_db, sql: string, params?: Record<string, unknown>) => {
    if (sql.startsWith('SELECT `value`')) return [marker === undefined ? [] : [{ value: marker }]]
    if (sql.startsWith('SELECT id')) return [hasFiles ? [{ id: 'files:fixture' }] : []]
    writes.push(sql)
    if (sql.startsWith('UPSERT')) marker = params?.value
    return [[]]
  })
  return writes
}

describe('media startup preservation (isolated synthetic records)', () => {
  it.each([undefined, 'historical-layout', { corrupt: true }, null])('refuses non-current marker %j with media without any write', async (marker) => {
    const writes = fixture(marker, true)
    await expect(ensureMediaStorageVersion({} as never)).rejects.toThrow(/preserved/)
    expect(writes).toEqual([])
  })
  it('preserves current media and custom settings without writes', async () => {
    const writes = fixture(MEDIA_STORAGE_VERSION, true)
    await ensureMediaStorageVersion({} as never)
    expect(writes).toEqual([])
  })
  it('preflight is read-only; fresh initialization is retryable and idempotent', async () => {
    const writes = fixture(undefined, false)
    await assertMediaStorageCompatible({} as never)
    expect(writes).toEqual([])
    query.mockRejectedValueOnce(new Error('interrupted'))
    await expect(ensureMediaStorageVersion({} as never)).rejects.toThrow('interrupted')
    await ensureMediaStorageVersion({} as never)
    await ensureMediaStorageVersion({} as never)
    expect(writes).toHaveLength(1)
    expect(writes[0]).not.toMatch(/DELETE|media settings/)
  })
  it('checks layout before applying schema or ownership backfills', async () => {
    const source = await readFile('server/plugins/db-init.ts', 'utf8')
    const check = source.indexOf('await assertMediaStorageCompatible(db)')
    expect(check).toBeGreaterThan(0)
    expect(check).toBeLessThan(source.indexOf('await applySchema(db, schema)'))
    expect(check).toBeLessThan(source.indexOf('await ensureUserTableMigration(db)'))
    expect(source).not.toContain('DELETE FROM files;')
  })
})
