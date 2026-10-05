import { DateTime, RecordId } from 'surrealdb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { groupOccurrences, runErrorGroupBackfill } from '../../server/utils/error-group-backfill'
const mocks = vi.hoisted(() => ({ queryDb: vi.fn(), useDb: vi.fn() }))
vi.mock('../../server/utils/db', () => mocks)
const row = (message: string, seen: string, read?: string) => ({ id: new RecordId('error_logs', message), message, timestamp: seen, level: 'error', path: '/api/posts/42', read_at: read })
beforeEach(() => vi.resetAllMocks())

describe('backfill aggregation', () => {
  it('computes first/last/count/latest sample for shuffled rows and merges legacy read state only when all are read', () => {
    const rows = [row('bad 1', '2026-01-02T00:00:00Z', '2026-02-01T00:00:00Z'), row('bad 2', '2026-01-01T00:00:00Z', '2026-02-02T00:00:00Z')]
    expect(groupOccurrences(rows)).toEqual([expect.objectContaining({ count: 2, first_seen: '2026-01-01T00:00:00Z', last_seen: '2026-01-02T00:00:00Z', message: 'bad 1', read_at: '2026-02-02T00:00:00Z', status_code: 500, fingerprint_version: 1 })])
    expect(groupOccurrences([...rows, row('bad 3', '2026-01-03T00:00:00Z')])[0]?.read_at).toBeNull()
    expect(groupOccurrences([rows[0]!, row('different', '2026-01-03T00:00:00Z')])).toHaveLength(2)
  })
  it('orders whole-second and fractional-second timestamps correctly, including sub-millisecond precision', () => {
    const rows = [row('bad 1', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), row('bad 2', '2026-01-01T00:00:00.000001Z', '2026-02-01T00:00:00.000002Z')]
    expect(groupOccurrences(rows)[0]).toMatchObject({ first_seen: rows[0]!.timestamp, last_seen: rows[1]!.timestamp, read_at: rows[1]!.read_at, message: 'bad 2' })
  })

  it('handles SDK datetimes and preserves nanosecond cursors', async () => {
    const source = row('legacy', '2026-01-01T00:00:00.000001Z')
    source.timestamp = new DateTime(source.timestamp).toString()
    mocks.queryDb.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[source]]).mockResolvedValueOnce([]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 1 }]]).mockResolvedValueOnce([])
    expect(await runErrorGroupBackfill({} as any)).toEqual({ migrated: 1, groups: 1 })
    expect(mocks.queryDb.mock.calls[3]?.[2]).toMatchObject({ ts: source.timestamp, id: 'legacy' })
    const commit = mocks.queryDb.mock.calls[2]!
    expect(commit[1]).toMatch(/^BEGIN TRANSACTION;/)
    expect(commit[1]).toContain('SET fingerprint = $f0 RETURN NONE;')
    expect(commit[1]).toContain('COMMIT TRANSACTION;')
    expect(commit[3]).toMatchObject({ retryOnReconnect: false })
  })
  it('skips a completed migration and never writes a success marker after failure', async () => {
    mocks.queryDb.mockResolvedValueOnce([[{ value: true }]])
    await runErrorGroupBackfill({} as any)
    expect(mocks.queryDb).toHaveBeenCalledTimes(1)
    mocks.queryDb.mockReset().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[row('bad', '2026-01-01T00:00:00Z')]]).mockRejectedValueOnce(new Error('rollback'))
    await expect(runErrorGroupBackfill({} as any)).rejects.toThrow('rollback')
    expect(mocks.queryDb).toHaveBeenCalledTimes(3)
    expect(mocks.queryDb.mock.calls.some(call => String(call[1]).includes("UPSERT type::record('app_settings'"))).toBe(false)
  })
  it('fails closed on malformed legacy timestamps', () => {
    expect(() => groupOccurrences([row('bad', 'invalid')])).toThrow('Invalid error backfill timestamp')
  })
})
