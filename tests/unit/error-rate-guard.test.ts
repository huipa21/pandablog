import { describe, expect, it } from 'vitest'
import { createErrorRateGuard } from '../../server/utils/logging-logic'

describe('error occurrence rate guard', () => {
  it('keeps 20 samples and accounts for all 100 errors, flushing the trailing 80 without another arrival', () => {
    const guard = createErrorRateGuard({ windowMs: 10_000, max: 20 })
    expect(Array.from({ length: 100 }, () => guard.hit('a', 0)).filter(Boolean)).toHaveLength(20)
    expect(guard.drain(999)).toEqual([])
    expect(guard.drain(1000)).toEqual([{ fingerprint: 'a', count: 80 }])
    expect(guard.drain(2000)).toEqual([])
    expect(guard.hit('a', 2000)).toBe(false)
    expect(guard.drain(2000)).toEqual([{ fingerprint: 'a', count: 1 }])
    expect(guard.hit('a', 10_000)).toBe(true)
  })
  it('isolates fingerprints and emits at most one aggregate per second', () => {
    const guard = createErrorRateGuard({ windowMs: 10_000, max: 1 })
    expect(guard.hit('a', 0)).toBe(true)
    expect(guard.hit('b', 0)).toBe(true)
    expect(guard.hit('a', 1)).toBe(false)
    expect(guard.drain(1000)).toEqual([{ fingerprint: 'a', count: 1 }])
    guard.hit('a', 1001)
    expect(guard.drain(1999)).toEqual([])
    expect(guard.drain(2000)).toEqual([{ fingerprint: 'a', count: 1 }])
  })
  it('forces a shutdown flush without resetting the active sampling window', () => {
    const guard = createErrorRateGuard({ windowMs: 10_000, max: 1 })
    guard.hit('a', 0); guard.hit('a', 1)
    expect(guard.drain(2, true)).toEqual([{ fingerprint: 'a', count: 1 }])
    expect(guard.hit('a', 3)).toBe(false)
  })
  it('preserves pending counts across the window boundary and rejects invalid configuration', () => {
    const guard = createErrorRateGuard({ windowMs: 10, max: 1 })
    guard.hit('a', 0); guard.hit('a', 1)
    expect(guard.hit('a', 10)).toBe(true)
    expect(guard.drain(20, true)).toEqual([{ fingerprint: 'a', count: 1 }])
    expect(() => createErrorRateGuard({ windowMs: 0, max: 1 })).toThrow()
    expect(() => createErrorRateGuard({ windowMs: 10, max: 0 })).toThrow()
  })
})
