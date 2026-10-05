import { describe, expect, it } from 'vitest'
import { hashAdminPassword, verifyAdminPassword } from '../../server/utils/admin-password'
import { hashPostPassword, verifyPostPassword } from '../../server/utils/post-password'
import { passwordAdmission } from '../../server/utils/admission'

// Actual Argon2, only generated synthetic secrets. No account/DB/application data.
describe('real native password admission', () => {
  it('shares two slots across admin/post hashing and verifies; rejects unsafe cost/input and measures driver RSS', async () => {
    const before = process.memoryUsage()
    let peakRss = before.rss
    const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss) }, 5)
    try {
      const pending = Array.from({length: 20}, (_, i) => (i % 2 ? hashPostPassword('fixture-only-secret') : hashAdminPassword('fixture-only-secret')))
      const results = await Promise.allSettled(pending)
      expect(results.filter(result => result.status === 'rejected').length).toBeGreaterThanOrEqual(2)
      expect(passwordAdmission.diagnostics()).toMatchObject({active: 0, waiting: 0, highActive: 2, highWaiting: 16})
      const good = results.find((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')!.value
      expect(await verifyAdminPassword(good, 'fixture-only-secret')).toBe(true)
      expect(await verifyPostPassword(good, 'wrong-fixture-password')).toBe(false)
      expect(await verifyAdminPassword(good.replace('m=65536', 'm=999999999'), 'fixture-only-secret')).toBe(false)
      expect(await verifyAdminPassword(good, 'x'.repeat(201))).toBe(false)
      const controller = new AbortController()
      controller.abort()
      await expect(hashAdminPassword('fixture-only-secret', controller.signal)).rejects.toThrow(/abort/i)
      process.stdout.write(JSON.stringify({evidence: 'REV-1.3-native-test-driver-not-Nitro-or-production', node: process.version, workload: '20 synthetic admin/post Argon2id requests, two active / sixteen queued / 2-second wait', before, peakRss, after: process.memoryUsage(), admission: passwordAdmission.diagnostics()}) + '\n')
    } finally { clearInterval(sample) }
  }, 30_000)
})
