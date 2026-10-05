import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOwnedStorage } from '../../scripts/backend-hardening/fixture'
import { barrier, manualClock } from '../helpers/backend-hardening'
import { isPrivateIp } from '../../server/utils/net/private-ip'
import { consumeRateLimit } from '../../server/utils/rate-limit'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

// Expected failures are intentional evidence, NOT fixes or skips. Vitest treats
// an unexpected pass as a failing test: the owning task must remove `.fails`.
// These tests call real helpers/packages; no SSRF connections are made.
describe('open backend findings (Phase 0 evidence)', () => {
  it.fails.each([
    ['F-04 mapped loopback', 'http://[::ffff:127.0.0.1]/'],
    ['F-04 mapped metadata', 'http://[::ffff:169.254.169.254]/'],
    ['F-04 link-local range', 'http://[fe90::1]/']
  ])('%s must be blocked before connection', (_name, input) => {
    const hostname = new URL(input).hostname.replace(/^\[|\]$/g, '')
    expect(isPrivateIp(hostname)).toBe(true)
  })

  it.fails('F-05 limit-one burst must reserve atomically (20 deterministic arrivals)', async () => {
    const clock = manualClock(1_000_000)
    vi.spyOn(Date, 'now').mockImplementation(clock.now)
    const gate = barrier(20)
    let state: { count: number, windowStart: number } | null = null
    vi.stubGlobal('useStorage', () => ({
      async getItem() {
        const snapshot = state ? { ...state } : null
        await gate.wait()
        return snapshot
      },
      async setItem(_key: string, value: { count: number, windowStart: number }) { state = { ...value } }
    }))
    const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit('fixture', '127.0.0.1', { limit: 1, windowMs: 60_000 })))
    expect(results.filter(result => result.allowed)).toHaveLength(1)
  })

  it.fails('F-06 installed filesystem store must expire untouched TTL keys', async () => {
    const owned = await createOwnedStorage()
    const store = createStorage({ driver: fsDriver({ base: owned.root }) })
    try {
      await store.setItem('ttl-probe', 1, { ttl: 1 })
      await delay(1200) // Actual driver/wall clock, not a fake expiry assertion.
      expect(await store.getItem('ttl-probe')).toBeNull()
    } finally { await store.dispose(); await owned.cleanup() }
  })

  it.fails('F-14 existing Archiver factory call must work on the installed runtime', () => {
    const archiver = createRequire(import.meta.url)('archiver')
    expect(() => archiver('zip')).not.toThrow()
  })
})
