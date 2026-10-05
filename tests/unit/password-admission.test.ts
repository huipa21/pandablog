import { describe, expect, it } from 'vitest'
import { BoundedAdmission } from '../../server/utils/admission'
import { ExpiringRateLimiter } from '../../server/utils/rate-limit'


describe('atomic bounded local limiter (actual backend, no filesystem)', () => {
  it('reserves a limit-one burst synchronously', async () => {
    const limiter = new ExpiringRateLimiter({maxKeys: 8, sweepMs: 10})
    try {
      const results = await Promise.all(Array.from({length: 20}, async () => limiter.reserve('fixture', 'ip', {limit: 1, windowMs: 50})))
      expect(results.filter(result => result.allowed)).toHaveLength(1)
    } finally { limiter.shutdown() }
  })
  it('sweeps untouched keys on the real clock and bounds high cardinality without live-key eviction', async () => {
    const limiter = new ExpiringRateLimiter({maxKeys: 3, sweepMs: 10})
    try {
      for (let i = 0; i < 100; i++) limiter.reserve('unlock', `unknown-${i}`, {limit: 1, windowMs: 20})
      expect(limiter.diagnostics().keys).toBe(3)
      expect(limiter.reserve('unlock', 'unknown-0', {limit: 1, windowMs: 20}).allowed).toBe(false)
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(limiter.diagnostics().keys).toBe(0)
    } finally { limiter.shutdown() }
  })
  it('validates finite budgets/key inputs and separates account/IP reservations', () => {
    const limiter = new ExpiringRateLimiter({maxKeys: 8, sweepMs: 10})
    try {
      expect(() => limiter.reserve('fixture', 'ip', {limit: NaN, windowMs: 1})).toThrow()
      expect(() => limiter.reserve('fixture', 'x'.repeat(4096), {limit: 1, windowMs: 1})).toThrow()
      expect(limiter.reserve('account', 'fixture-user', {limit: 1, windowMs: 100}).allowed).toBe(true)
      expect(limiter.reserve('account', 'fixture-user', {limit: 1, windowMs: 100}).allowed).toBe(false)
      expect(limiter.reserve('ip', 'fixture-user', {limit: 1, windowMs: 100}).allowed).toBe(true)
      limiter.shutdown()
      expect(limiter.reserve('fixture', 'ip', {limit: 1, windowMs: 100}).allowed).toBe(false)
    } finally { limiter.shutdown() }
  })
})

describe('bounded work admission', () => {
  it('rejects overflow, cancels queued work, retains native slots until completion and releases failures', async () => {
    const admission = new BoundedAdmission({active: 1, waiting: 1, waitMs: 100})
    let release!: () => void
    const active = admission.run(() => new Promise<void>(resolve => { release = resolve }))
    await new Promise(resolve => setImmediate(resolve))
    const controller = new AbortController()
    const waiting = admission.run(async () => 'must-not-run', controller.signal)
    await expect(admission.run(async () => 'overflow')).rejects.toMatchObject({statusCode: 429})
    controller.abort()
    await expect(waiting).rejects.toThrow(/abort/i)
    expect(admission.diagnostics()).toMatchObject({active: 1, waiting: 0})
    release()
    await active
    await expect(admission.run(async () => { throw new Error('native failure') })).rejects.toThrow('native failure')
    expect(admission.diagnostics()).toMatchObject({active: 0, waiting: 0})
    await expect(admission.shutdown()).resolves.toBe(true)
  })
  it('caller abort never releases a running native slot early', async () => {
    const admission = new BoundedAdmission({active: 1, waiting: 0, waitMs: 20})
    const controller = new AbortController()
    let release!: () => void
    const pending = admission.run(() => new Promise<void>(resolve => {release = resolve}), controller.signal)
    await new Promise(resolve => setImmediate(resolve))
    controller.abort()
    expect(admission.diagnostics().active).toBe(1)
    await expect(admission.run(async () => {})).rejects.toMatchObject({statusCode: 429})
    release()
    await expect(pending).rejects.toThrow(/abort/i)
    expect(admission.diagnostics().active).toBe(0)
    await admission.shutdown()
  })
  it('timeouts/shutdown reject waiters; shutdown does not free a still-running native allocation', async () => {
    const admission = new BoundedAdmission({active: 1, waiting: 1, waitMs: 20})
    let release!: () => void
    const active = admission.run(() => new Promise<void>(resolve => { release = resolve }))
    await new Promise(resolve => setImmediate(resolve))
    await expect(admission.run(async () => {})).rejects.toMatchObject({statusCode: 429})
    const waiting = admission.run(async () => {}).catch(error => error)
    expect(await admission.shutdown(10)).toBe(false)
    expect(await waiting).toMatchObject({statusCode: 503})
    expect(admission.diagnostics().active).toBe(1)
    release()
    await active
    expect(admission.diagnostics().active).toBe(0)
    await expect(admission.run(async () => {})).rejects.toMatchObject({statusCode: 503})
  })
})
