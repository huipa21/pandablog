import { describe, expect, it } from 'vitest'
import { accessLogDateWindow, accessLogPickerIso, accessLogPickerValue } from '../../utils/loggingAccessUi'

const now = new Date('2026-05-20T10:12:03.123Z')

describe('access log UI date window', () => {
  it('defaults both dates to an exact last-24-hour window, with UTC day retention bounds', () => {
    expect(accessLogDateWindow({}, 30, now)).toEqual({
      from: '2026-05-19T10:12:03.123Z', to: now.toISOString(),
      min: '2026-04-20T00:00:00.000Z', max: now.toISOString()
    })
  })

  it('preserves an explicit date window and normalizes timezone offsets to UTC', () => {
    expect(accessLogDateWindow({ from: '2026-05-10T08:00:00+08:00', to: '2026-05-18T23:00:00-04:00' }, 30, now)).toMatchObject({
      from: '2026-05-10T00:00:00.000Z', to: '2026-05-19T03:00:00.000Z'
    })
  })

  it('interprets zone-less bookmarked date-times as UTC in any host timezone', () => {
    expect(accessLogDateWindow({ from: '2026-05-10T08:00', to: '2026-05-18T23:00:01.123' }, 30, now)).toMatchObject({
      from: '2026-05-10T08:00:00.000Z', to: '2026-05-18T23:00:01.123Z'
    })
  })

  it('defaults a missing from to 24 hours before an explicit to', () => {
    expect(accessLogDateWindow({ to: '2026-05-15T00:00:00Z' }, 30, now)).toMatchObject({
      from: '2026-05-14T00:00:00.000Z', to: '2026-05-15T00:00:00.000Z'
    })
  })

  it('uses midnight UTC, not rolling hours, as the retention minimum', () => {
    expect(accessLogDateWindow({ from: '2026-04-01', to: '2026-05-30' }, 1, now)).toMatchObject({
      from: '2026-05-19T00:00:00.000Z', to: now.toISOString(), min: '2026-05-19T00:00:00.000Z'
    })
  })

  it('clamps expired, future, and reversed windows to valid ordered bounds', () => {
    expect(accessLogDateWindow({ from: '2026-01-01', to: '2026-01-02' }, 30, now)).toMatchObject({
      from: '2026-04-20T00:00:00.000Z', to: '2026-04-20T00:00:00.000Z'
    })
    expect(accessLogDateWindow({ from: '2026-05-19', to: '2026-05-18' }, 30, now)).toMatchObject({
      from: '2026-05-18T00:00:00.000Z', to: '2026-05-18T00:00:00.000Z'
    })
    expect(accessLogDateWindow({ from: '2026-06-01' }, 30, now).from).toBe(now.toISOString())
  })

  it.each([{}, { from: '', to: '' }, { from: 'bad', to: 'bad' }, { from: ['2026-05-01'], to: 123 }])('defaults absent/invalid dates (%j) instead of falling back to the reader 7-day range', query => {
    expect(accessLogDateWindow(query, 30, now).from).toBe('2026-05-19T10:12:03.123Z')
  })

  it.each([0, -1, 1.5, 3651, NaN])('defaults malformed retention (%s) to 30 days', days => {
    expect(accessLogDateWindow({}, days, now).min).toBe('2026-04-20T00:00:00.000Z')
  })

  it('supports the maximum saved retention window across leap years', () => {
    const window = accessLogDateWindow({ from: '2000-01-01' }, 3650, new Date('2024-03-01T00:30:00Z'))
    expect(window.from).toBe('2014-03-04T00:00:00.000Z')
  })

  it('round-trips explicit UTC picker values with millisecond precision and blank defaults', () => {
    expect(accessLogPickerValue(now.toISOString())).toBe('2026-05-20T10:12:03.123')
    expect(accessLogPickerIso(accessLogPickerValue(now.toISOString()))).toBe(now.toISOString())
    expect(accessLogPickerIso('2026-05-20T03:04')).toBe('2026-05-20T03:04Z')
    expect(accessLogPickerIso('')).toBe('')
  })
})
