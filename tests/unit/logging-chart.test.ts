import { describe, expect, it } from 'vitest'
import { accessHourlyChartPoints } from '../../utils/loggingChart'
import type { AccessHourlyBucket } from '../../types/logging'

const series = (): AccessHourlyBucket[] => Array.from({ length: 24 }, (_, index) => ({
  hour: new Date(Date.UTC(2026, 4, 20, 1 + index)).toISOString(), count: 0, errors: 0
}))

describe('dashboard hourly chart points', () => {
  it('preserves all server buckets, their order, full counts and 5xx errors without mutating them', () => {
    const buckets = series()
    buckets[22] = { ...buckets[22]!, count: 450, errors: 15 }
    buckets[23] = { ...buckets[23]!, count: 225, errors: 1 }
    const snapshot = structuredClone(buckets)
    const points = accessHourlyChartPoints(buckets)
    expect(points).toHaveLength(24)
    expect(points.map(point => point.hour)).toEqual(buckets.map(bucket => bucket.hour))
    expect(points[22]).toEqual({ ...buckets[22], label: '2026-05-20 23:00', height: 100 })
    expect(points[23]).toEqual({ ...buckets[23], label: '2026-05-21 00:00', height: 50 })
    expect(points.reduce((sum, point) => sum + point.count, 0)).toBe(675)
    expect(buckets).toEqual(snapshot)
  })

  it('does not draw traffic for empty buckets and never divides by zero', () => {
    expect(accessHourlyChartPoints([])).toEqual([])
    const points = accessHourlyChartPoints(series())
    expect(points).toHaveLength(24)
    expect(points.every(point => point.height === 0)).toBe(true)
  })

  it('keeps small nonzero counts visible without giving empty hours a minimum height', () => {
    const buckets = series()
    buckets[0]!.count = 1
    buckets[1]!.count = 1000
    const points = accessHourlyChartPoints(buckets)
    expect(points[0]!.height).toBe(6)
    expect(points[1]!.height).toBe(100)
    expect(points[2]!.height).toBe(0)
  })

  it('labels the API UTC hour and date rather than the client timezone or clock', () => {
    expect(accessHourlyChartPoints([{ hour: '2025-12-31T23:00:00.000Z', count: 5, errors: 2 }])[0]).toMatchObject({
      hour: '2025-12-31T23:00:00.000Z', label: '2025-12-31 23:00', height: 100
    })
  })
})
