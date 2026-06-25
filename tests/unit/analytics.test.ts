import { describe, expect, it } from 'vitest'
import { isAnalyticsBot } from '../../server/utils/analytics/bots'
import { addUtcDays, resolveGeoQueryWindows, startOfUtcDay, utcDateString } from '../../server/utils/analytics/date'
import { normalizeAnalyticsPath, normalizeAnalyticsReferrer } from '../../server/utils/analytics/path'
import { isMissingAnalyticsTableError } from '../../server/utils/analytics/tables'

describe('analytics helpers', () => {
  it('filters crawler user agents', () => {
    expect(isAnalyticsBot('Mozilla/5.0 Googlebot/2.1')).toBe(true)
    expect(isAnalyticsBot('Mozilla/5.0 Safari/605.1.15')).toBe(false)
  })

  it('normalizes public paths and rejects private surfaces', () => {
    expect(normalizeAnalyticsPath('/blog/post?utm=local')).toBe('/blog/post?utm=local')
    expect(normalizeAnalyticsPath('https://example.com/tag/vue')).toBe('/tag/vue')
    expect(normalizeAnalyticsPath('/admin')).toBeNull()
    expect(normalizeAnalyticsPath('/api/posts')).toBeNull()
  })

  it('normalizes referrer and UTC day helpers', () => {
    expect(normalizeAnalyticsReferrer('  /from  ')).toBe('/from')
    const start = startOfUtcDay(new Date('2026-06-13T18:25:00.000Z'))
    expect(utcDateString(start)).toBe('2026-06-13')
    expect(utcDateString(addUtcDays(start, -1))).toBe('2026-06-12')
  })

  it('detects missing analytics tables without matching unrelated schema errors', () => {
    expect(isMissingAnalyticsTableError(new Error("The table 'pageview' does not exist"))).toBe(true)
    expect(isMissingAnalyticsTableError(new Error("The table 'post' does not exist"))).toBe(false)
    expect(isMissingAnalyticsTableError(new Error('Database query timed out'))).toBe(false)
  })
})

describe('resolveGeoQueryWindows', () => {
  const todayStart = startOfUtcDay(new Date('2026-06-25T10:00:00.000Z'))

  it('reads in-retention ranges straight from raw pageviews and skips the stale rollup', () => {
    // 7-day range, 90-day retention: every day is in retention, so geo comes
    // entirely from raw pageviews and the stale rollup table is never queried.
    const range = {
      from: addUtcDays(todayStart, -6),
      to: addUtcDays(todayStart, 1),
      todayStart
    }
    const windows = resolveGeoQueryWindows(range, 90)
    expect(windows.rollup).toBeNull()
    expect(windows.raw).not.toBeNull()
    expect(windows.raw!.from.toISOString()).toBe(range.from.toISOString())
    expect(windows.raw!.to.toISOString()).toBe(range.to.toISOString())
  })

  it('splits a range that straddles the retention cutoff without overlap', () => {
    // 100-day range, 90-day retention: older days fall back to the rollup table,
    // recent days read raw pageviews, and the two windows meet at the cutoff.
    const range = {
      from: addUtcDays(todayStart, -100),
      to: addUtcDays(todayStart, 1),
      todayStart
    }
    const windows = resolveGeoQueryWindows(range, 90)
    const cutoff = addUtcDays(todayStart, -90)
    expect(windows.rollup).not.toBeNull()
    expect(windows.raw).not.toBeNull()
    expect(windows.rollup!.from.toISOString()).toBe(range.from.toISOString())
    expect(windows.rollup!.to.toISOString()).toBe(cutoff.toISOString())
    expect(windows.raw!.from.toISOString()).toBe(cutoff.toISOString())
    expect(windows.raw!.to.toISOString()).toBe(range.to.toISOString())
  })

  it('uses only the rollup table for ranges entirely older than retention', () => {
    const range = {
      from: addUtcDays(todayStart, -120),
      to: addUtcDays(todayStart, -100),
      todayStart
    }
    const windows = resolveGeoQueryWindows(range, 90)
    expect(windows.raw).toBeNull()
    expect(windows.rollup).not.toBeNull()
    expect(windows.rollup!.from.toISOString()).toBe(range.from.toISOString())
    expect(windows.rollup!.to.toISOString()).toBe(range.to.toISOString())
  })
})
