import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryDb = vi.fn()
vi.mock('../../server/utils/db', () => ({ queryDb: (...args: unknown[]) => queryDb(...args), findBySlug: vi.fn() }))

const { readPostTaxonomy, syncPostTaxonomy, repairMisaddressedTaxonomyEdges } = await import('../../server/utils/taxonomy')

const db = {} as never

beforeEach(() => {
  queryDb.mockReset()
})

describe('post id normalization', () => {
  it('reads taxonomy with a bare post id even when given `post:abc`', async () => {
    queryDb.mockResolvedValueOnce([[], []])
    await readPostTaxonomy(db, 'post:abc')
    expect(queryDb.mock.calls[0]![2]).toEqual({ postTable: 'post', postId: 'abc' })
  })

  it('relates tags to the real post when given `post:abc`', async () => {
    queryDb.mockImplementation(async (_db: unknown, sql: string) => {
      if (sql.includes("slug = 'null'")) return [[]]
      if (sql.includes('FROM tag WHERE')) return [[{ id: 'tag:t1' }]]
      return [[]]
    })
    await syncPostTaxonomy(db, 'post:abc', ['tag:t1'])
    const batch = queryDb.mock.calls.find(([, sql]) => String(sql).includes('RELATE'))
    expect(batch).toBeTruthy()
    expect(batch![2]).toMatchObject({ postTable: 'post', postId: 'abc' })
  })
})

describe('repairMisaddressedTaxonomyEdges', () => {
  it('re-links edges of posts without valid edges and only removes stale ones otherwise', async () => {
    const applied: Array<{ sql: string, params: Record<string, unknown> }> = []
    queryDb.mockImplementation(async (_db: unknown, sql: string, params?: Record<string, unknown>) => {
      if (sql.includes('FROM tagged WHERE string::starts_with')) {
        return [[
          { id: 'tagged:1', post_key: 'post:fresh', out: 'tag:a' },
          { id: 'tagged:2', post_key: 'post:fresh', out: 'tag:a' },
          { id: 'tagged:3', post_key: 'post:edited', out: 'tag:old' },
          { id: 'tagged:4', post_key: 'post:gone', out: 'tag:b' }
        ]]
      }
      if (sql.includes('FROM categorized_as WHERE string::starts_with')) {
        return [[]]
      }
      if (sql.includes("SELECT id FROM type::record('post'")) {
        const postId = params!.postId
        const exists = postId !== 'gone'
        const valid = postId === 'edited' ? 1 : 0
        return [exists ? [{ id: `post:${String(postId)}` }] : [], valid ? [{ total: valid }] : []]
      }
      applied.push({ sql, params: params ?? {} })
      return []
    })

    const result = await repairMisaddressedTaxonomyEdges(db)

    expect(result).toEqual({ relinked: 1, removed: 4 })
    const byPost = new Map(applied.map((entry) => [entry.params.postId, entry]))
    // fresh: one RELATE for the de-duplicated target, both broken edges deleted.
    expect(byPost.get('fresh')!.sql.match(/RELATE/g)).toHaveLength(1)
    expect(byPost.get('fresh')!.params.edgeIds).toEqual(['tagged:1', 'tagged:2'])
    // edited: valid edges exist -> no RELATE, stale edge deleted.
    expect(byPost.get('edited')!.sql).not.toContain('RELATE')
    expect(byPost.get('edited')!.params.edgeIds).toEqual(['tagged:3'])
    // gone: post missing -> only deleted.
    expect(byPost.get('gone')!.sql).not.toContain('RELATE')
  })
})
