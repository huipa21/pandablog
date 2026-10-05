import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bulkErrorGroups, bulkErrorGroupsSchema, deleteErrorGroupsByFingerprints, errorGroupListSchema, listErrorGroups, readErrorGroup, retainErrorGroups } from '../../server/utils/error-groups'
const mocks = vi.hoisted(() => ({ queryDb: vi.fn(), useDb: vi.fn().mockResolvedValue({}) }))
vi.mock('../../server/utils/db', () => mocks)
const fp = '0123456789abcdef'
beforeEach(() => { vi.clearAllMocks(); mocks.queryDb.mockResolvedValue([[]]) })

describe('error group validation', () => {
  it('defaults to unread, supports all statuses and allowed sorting/pagination', () => {
    expect(errorGroupListSchema.parse({})).toEqual({ status: 'unread', sort: 'last_seen', limit: 50, offset: 0 })
    expect(errorGroupListSchema.parse({ status: 'resolved', sort: 'count', limit: '200', offset: '50', from: '2026-01-01T00:00:00Z' })).toMatchObject({ limit: 200, offset: 50 })
  })
  it.each([{ status: 'bad' }, { sort: 'id;DELETE users' }, { limit: 201 }, { limit: 0 }, { offset: -1 }, { offset: 0.5 }, { search: 'x'.repeat(201) }, { from: 'not a date' }, { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }, { extra: true }])('rejects invalid list query %j', input => {
    expect(errorGroupListSchema.safeParse(input).success).toBe(false)
  })
  it.each(['mark_read', 'mark_unread', 'resolve', 'unresolve', 'delete'])('accepts %s with normalized record or raw IDs', action => {
    expect(bulkErrorGroupsSchema.parse({ action, ids: [`error_groups:⟨${fp}⟩`, fp] })).toEqual({ action, ids: [fp, fp] })
  })
  it.each([{ action: 'bad', ids: [fp] }, { action: 'delete', ids: [] }, { action: 'delete', ids: Array(201).fill(fp) }, { action: 'delete', ids: ['error_logs:0123456789abcdef'] }, { action: 'delete', ids: ['a;DELETE users'] }, { action: 'delete', ids: [fp], extra: true }])('rejects invalid bulk payload %j', input => {
    expect(bulkErrorGroupsSchema.safeParse(input).success).toBe(false)
  })
})

describe('error group queries', () => {
  it('binds search and dates, uses unread-group semantics and normalizes display messages', async () => {
    mocks.queryDb.mockResolvedValueOnce([[{ fingerprint: fp, message: 'Post post:123 failed 42' }], [{ total: 1 }]])
    const input = errorGroupListSchema.parse({ search: "' OR true", from: '2026-01-01T00:00:00Z' })
    expect(await listErrorGroups(input)).toMatchObject({ total: 1, rows: [{ normalized_message: 'Post <rid> failed <n>' }], sort: 'last_seen' })
    const [, sql, params] = mocks.queryDb.mock.calls[0]!
    expect(sql).toContain('resolved_at = NONE AND read_at = NONE')
    expect(sql).toContain('last_seen >= <datetime>$from')
    expect(sql).not.toContain(input.search)
    expect(params.search).toBe(input.search)
  })
  it('gets latest 50 occurrences and returns null for a missing group', async () => {
    mocks.queryDb.mockResolvedValueOnce([[{ fingerprint: fp }], [{ id: 'error_logs:one' }]])
    expect(await readErrorGroup(fp)).toEqual({ group: { fingerprint: fp }, occurrences: [{ id: 'error_logs:one' }] })
    expect(mocks.queryDb.mock.calls[0]?.[1]).toContain('LIMIT 50')
    expect(await readErrorGroup(fp)).toBeNull()
  })
  it('deduplicates bulk ids, resolves and reopens without creating nonexistent groups', async () => {
    mocks.queryDb.mockResolvedValueOnce([[{ fingerprint: fp }]])
    expect(await bulkErrorGroups({ action: 'resolve', ids: [fp, fp] })).toMatchObject({ updated: 1, updated_ids: [fp] })
    expect(mocks.queryDb.mock.calls[0]?.[1]).toContain('resolved_at = time::now(), read_at = time::now(), regressed = false')
    expect(mocks.queryDb.mock.calls[0]?.[1]).toMatch(/^UPDATE error_groups/)
    expect(mocks.queryDb.mock.calls[0]?.[2]).toEqual({ ids: [fp] })
  })
  it('batches group and occurrence deletion, rechecks retention cutoff transactionally', async () => {
    mocks.queryDb.mockResolvedValueOnce([{ occurrences: 2000, ids: [] }]).mockResolvedValueOnce([{ occurrences: 1, ids: [fp] }])
    const cutoff = new Date('2026-01-01T00:00:00Z')
    expect(await deleteErrorGroupsByFingerprints([fp], cutoff)).toEqual({ groups: 1, occurrences: 2001, ids: [fp] })
    expect(mocks.queryDb).toHaveBeenCalledTimes(2)
    expect(mocks.queryDb.mock.calls[0]?.[1]).toContain('last_seen < $cutoff')
    expect(mocks.queryDb.mock.calls[0]?.[1]).not.toContain('RETURN BEFORE')
    expect(mocks.queryDb.mock.calls[0]?.[3]).toMatchObject({ retryOnReconnect: false, timeoutMs: 30_000 })
  })
  it('enforces exact caps in bounded batches without changing lifetime group count', async () => {
    mocks.queryDb.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ fingerprint: fp, total: 4051 }]])
      .mockResolvedValueOnce([null, [], 2000]).mockResolvedValueOnce([null, [], 2000]).mockResolvedValueOnce([null, [], 1]).mockResolvedValueOnce([[]])
    expect(await retainErrorGroups(new Date(), 50)).toEqual({ groups: 0, occurrences: 4001 })
    const caps = mocks.queryDb.mock.calls.filter(call => call[3]?.label === 'cap error occurrences')
    expect(caps.map(call => call[2].batch)).toEqual([2000, 2000, 1])
    expect(caps[0]?.[1]).toContain('id NOT IN $keep')
    expect(caps[0]?.[1]).toContain('timestamp DESC, id DESC')
    expect(mocks.queryDb.mock.calls.at(-1)?.[2]).toEqual({ after: fp })
    expect(caps[0]?.[1]).not.toContain('UPDATE error_groups')
  })
  it('skips groups under the cap and fails safely on invalid caps or deletion counts', async () => {
    mocks.queryDb.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ fingerprint: fp, total: 50 }]]).mockResolvedValueOnce([[]])
    expect(await retainErrorGroups(new Date(), 50)).toEqual({ groups: 0, occurrences: 0 })
    await expect(retainErrorGroups(new Date(), 501)).rejects.toThrow('Invalid error occurrence cap')
    mocks.queryDb.mockResolvedValueOnce([{ occurrences: -1, ids: [] }])
    await expect(deleteErrorGroupsByFingerprints([fp])).rejects.toThrow('Invalid error group deletion result')
  })
})
