import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryDb = vi.fn()
vi.mock('../../server/utils/db', () => ({ queryDb: (...args: unknown[]) => queryDb(...args) }))

const { computePostSearchTerms, syncPostSearchTerms, removePostSearchTerms, lookupFuzzyCandidates, expandFuzzyNeedles } = await import('../../server/utils/searchTerms')

const db = {} as never

beforeEach(() => {
  queryDb.mockReset()
})

describe('computePostSearchTerms', () => {
  it('collects body words for `post` and title words for `post_title`', () => {
    expect(computePostSearchTerms({
      status: 'draft',
      title: 'GitHub Actions',
      summary: 'Pipelines',
      blockTexts: ['Every workflow', '国际化']
    })).toEqual({
      post: ['github', 'actions', 'pipelines', 'every', 'workflow'],
      post_title: ['github', 'actions']
    })
  })

  it('drops everything for archived posts', () => {
    expect(computePostSearchTerms({ status: 'archived', title: 'GitHub', blockTexts: ['workflow'] })).toEqual({ post: [], post_title: [] })
  })
})

describe('syncPostSearchTerms', () => {
  it('applies only the difference to the stored word list', async () => {
    queryDb
      .mockResolvedValueOnce([[
        { scope: 'post', terms: ['github', 'legacy'] },
        { scope: 'post_title', terms: ['github'] }
      ]])
      .mockResolvedValueOnce([])

    await syncPostSearchTerms(db, 'post:abc', { status: 'published', title: 'GitHub', blockTexts: ['github workflow'] })

    expect(queryDb).toHaveBeenCalledTimes(2)
    const [, sql, params] = queryDb.mock.calls[1]!
    expect(sql).toContain('BEGIN TRANSACTION;')
    expect(params).toMatchObject({
      source: 'post:abc',
      scope_0: 'post',
      added_0: [{ term: 'workflow', first_char: 'w', term_len: 8 }],
      removed_0: ['legacy'],
      terms_0: ['github', 'workflow']
    })
    // post_title did not change, so no statements for it.
    expect(params).not.toHaveProperty('scope_1')
  })

  it('does nothing when nothing changed', async () => {
    queryDb.mockResolvedValueOnce([[{ scope: 'post', terms: ['github'] }, { scope: 'post_title', terms: ['github'] }]])
    await syncPostSearchTerms(db, 'abc', { status: 'published', title: 'GitHub' })
    expect(queryDb).toHaveBeenCalledTimes(1)
    expect(queryDb.mock.calls[0]![2]).toEqual({ source: 'post:abc' })
  })

  it('removes the source rows on delete', async () => {
    queryDb
      .mockResolvedValueOnce([[{ scope: 'post', terms: ['github'] }]])
      .mockResolvedValueOnce([])
    await removePostSearchTerms(db, 'post:abc')
    const [, sql, params] = queryDb.mock.calls[1]!
    expect(sql).toContain("DELETE type::record('search_term_source', [$scope_0, $source]);")
    expect(params).toMatchObject({ removed_0: ['github'], added_0: [] })
  })

  it('never throws', async () => {
    queryDb.mockRejectedValueOnce(new Error('db down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(syncPostSearchTerms(db, 'post:abc', { title: 'x' })).resolves.toBeUndefined()
    warn.mockRestore()
  })
})

describe('lookupFuzzyCandidates / expandFuzzyNeedles', () => {
  it('marks known words and ranks candidates', async () => {
    queryDb.mockResolvedValueOnce([
      // gibhub: candidates
      [{ term: 'github', df: 3, distance: 1 }, { term: 'gitlab', df: 9, distance: 2 }],
      [],
      // gith: prefix of a known word
      [],
      ['github']
    ])
    const result = await lookupFuzzyCandidates(db, 'post', ['gibhub', 'gith', 'ci'])
    expect(result.get('gibhub')).toEqual({ known: false, candidates: [{ term: 'github', df: 3, distance: 1 }, { term: 'gitlab', df: 9, distance: 2 }] })
    expect(result.get('gith')).toEqual({ known: true, candidates: [] })
    // Too short: never looked up.
    expect(result.has('ci')).toBe(false)
  })

  it('builds rewritten needles per keyword', async () => {
    queryDb.mockResolvedValueOnce([[{ term: 'github', df: 3, distance: 1 }], []])
    const variants = await expandFuzzyNeedles(db, 'post', ['Gibhub actions', 'ci'])
    expect(variants.get('Gibhub actions')).toEqual([{ text: 'github actions', distance: 1 }])
    expect(variants.has('ci')).toBe(false)
  })

  it('degrades to no fuzzy needles when the lookup fails', async () => {
    queryDb.mockRejectedValueOnce(new Error('db down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await expandFuzzyNeedles(db, 'post', ['gibhub'])).size).toBe(0)
    warn.mockRestore()
  })
})
