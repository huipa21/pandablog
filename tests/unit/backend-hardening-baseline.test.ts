import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { manualClock } from '../helpers/backend-hardening'
import { isPrivateIp } from '../../server/utils/net/private-ip'
import { consumeRateLimit, ExpiringRateLimiter } from '../../server/utils/rate-limit'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

// Expected failures are intentional evidence, NOT fixes or skips. Vitest treats
// an unexpected pass as a failing test: the owning task must remove `.fails`.
// These tests call real helpers/packages; no SSRF connections are made.
describe('open backend findings (Phase 0 evidence)', () => {
  it.each([
    ['F-04 mapped loopback', 'http://[::ffff:127.0.0.1]/'],
    ['F-04 mapped metadata', 'http://[::ffff:169.254.169.254]/'],
    ['F-04 link-local range', 'http://[fe90::1]/']
  ])('%s must be blocked before connection', (_name, input) => {
    const hostname = new URL(input).hostname.replace(/^\[|\]$/g, '')
    expect(isPrivateIp(hostname)).toBe(true)
  })

  it('F-05 limit-one burst must reserve atomically (20 deterministic arrivals)', async () => {
    const clock = manualClock(1_000_000)
    vi.spyOn(Date, 'now').mockImplementation(clock.now)
    const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit('fixture', '127.0.0.1', { limit: 1, windowMs: 60_000 })))
    expect(results.filter(result => result.allowed)).toHaveLength(1)
  })

  it('F-06 chosen local backend expires untouched keys without permanent files', async () => {
    const store = new ExpiringRateLimiter({maxKeys: 8, sweepMs: 10})
    try {
      store.reserve('fixture', 'untouched', {limit: 1, windowMs: 20})
      await delay(60) // Actual chosen backend/wall-clock sweep, not a mocked TTL.
      expect(store.diagnostics().keys).toBe(0)
    } finally { store.shutdown() }
  })

  it('F-14 installed Archiver 8 named ZipArchive constructor works', () => {
    const {ZipArchive} = createRequire(import.meta.url)('archiver')
    const archive = new ZipArchive({zlib: {level: 5}})
    expect(archive).toBeDefined()
    archive.abort(); archive.destroy()
  })
})
