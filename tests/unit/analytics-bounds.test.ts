import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { getAnalyticsOverview, parseAnalyticsLimit, parseAnalyticsRange } from '../../server/utils/analytics/read'
import { cleanupAnalyticsRetention, rollupAnalyticsDay, rollupCompletedAnalyticsDays } from '../../server/utils/analytics/rollup'

const query = vi.hoisted(() => vi.fn())
vi.mock('../../server/utils/db', () => ({useDb: async () => ({}), queryDb: query}))
vi.mock('../../server/utils/settings', () => ({getAnalyticsSettings: () => ({analytics_retention_days: 90})}))

function event(url: string) {
  const req = new IncomingMessage(new Socket()); req.url = url
  return createEvent(req, new ServerResponse(req))
}
beforeEach(() => {query.mockReset()})
describe('bounded analytics contracts', () => {
  it('rejects malformed, reversed and oversized date ranges instead of silently defaulting', () => {
    for (const url of ['/?from=invalid', '/?from=2026-02-30', '/?from=2020-01-01&to=2026-01-01', '/?from=2026-01-02&to=2026-01-01', '/?from=2026-01-01&from=2026-01-02']) {
      expect(() => parseAnalyticsRange(event(url))).toThrow()
    }
  })
  it('rejects invalid limits', () => {
    for (const value of ['Infinity', '-1', '1.5', ['5'], 0]) expect(() => parseAnalyticsLimit(value, 10, 50)).toThrow()
    expect(parseAnalyticsLimit(undefined, 10, 50)).toBe(10)
  })
  it('dashboard totals never project raw visitors or session rows', async () => {
    query.mockImplementation(async (_db, sql: string) => {
      if (/^\s*SELECT visitor_hash\s+FROM pageview|^\s*SELECT pageview_count, started_at/.test(sql)) throw new Error('raw rows reached Node')
      return [[{page_views: 3, unique_visitors: 2, sessions: 2, bounce_sessions: 1, total_visit_seconds: 20}]]
    })
    const overview = await getAnalyticsOverview(parseAnalyticsRange(event('/?range=today')))
    expect(overview.scorecards).toMatchObject({pageViews: 3, uniqueVisitors: 2, sessions: 2, bounceRate: 0.5, avgVisitSeconds: 10})
  })
  it('publishes every summary in one bounded transaction, never visible delete/create calls', async () => {
    query.mockResolvedValue([[]])
    await rollupAnalyticsDay({} as never, new Date('2026-01-01'))
    const publication = query.mock.calls.find(call => String(call[1]).includes('BEGIN TRANSACTION'))
    expect(publication).toBeTruthy()
    expect(String(publication![1])).toContain('COMMIT TRANSACTION')
    expect(String(publication![1])).toContain('RETURN NONE')
    expect(query.mock.calls.some(call => /SELECT path, visitor_hash/.test(call[1]))).toBe(false)
  })
  it('reports capped retention as incomplete and selects only published/finalized epoch-matched raw days', async () => {
    query.mockResolvedValue([[{deleted: 500}]])
    const reports = await cleanupAnalyticsRetention(new Date('2026-06-01'))
    expect(reports.pageview).toMatchObject({deleted: 10_000, completed: false, stopReason: 'batch-limit'})
    const sql = query.mock.calls[0]![1]
    expect(sql).toContain('publication_epoch = $publication.epoch')
    expect(sql).toContain('finalized = true'); expect(sql).toContain('LIMIT 500'); expect(sql).toContain('RETURN NONE')
  })
  it('stops further retention after an uncertain DB outcome and reports unknown counts', async () => {
    query.mockRejectedValue(Object.assign(new Error('Ambiguous response'), {data: {uncertain: true}}))
    const reports = await cleanupAnalyticsRetention(new Date('2026-06-01'))
    expect(reports.pageview).toMatchObject({completed: false, stopReason: 'error', countKnown: false})
    expect(query).toHaveBeenCalledTimes(1)
  })
  it('refuses invalid oldest timestamps instead of treating infinity as empty history', async () => {
    query.mockResolvedValue([[{created_at: Infinity, oldest: Infinity}]])
    await expect(rollupCompletedAnalyticsDays()).rejects.toThrow()
  })
})
