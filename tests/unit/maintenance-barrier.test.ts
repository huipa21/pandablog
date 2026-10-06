import { describe, expect, it } from 'vitest'
import { WriteBarrier } from '../../server/utils/maintenance'

function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => {resolve = yes}); return {resolve, promise} }

describe('restore write barrier', () => {
  it('closes synchronously, drains entire operations, permits only its owner, and retains failed drains', async () => {
    const barrier = new WriteBarrier()
    const pending = deferred(), started = deferred()
    const work = barrier.run(async () => {started.resolve(); await pending.promise; await barrier.run(async () => {})})
    await started.promise
    const owner = Object.freeze({token: 'synthetic-owner'})
    const drain = barrier.close(owner, 1000)
    await expect(barrier.run(async () => {})).rejects.toMatchObject({statusCode: 503})
    expect(barrier.status().active).toBe(1)
    await expect(barrier.runOwner({}, async () => {})).rejects.toThrow()
    pending.resolve()
    await work; await drain
    await barrier.runOwner(owner, async () => {await barrier.run(async () => {})})
    expect(barrier.status().active).toBe(0)
    barrier.reopen(owner)
    await barrier.run(async () => {})
  })

  it('fences after restart and cannot reopen via an old owner or deadline', async () => {
    const barrier = new WriteBarrier()
    const old = {}, current = {}, pending = deferred()
    const work = barrier.run(() => pending.promise)
    await expect(barrier.close(old, 1)).rejects.toThrow()
    expect(barrier.status().closed).toBe(true)
    pending.resolve(); await work
    barrier.reopen(old)
    await barrier.close(current, 10)
    expect(() => barrier.reopen(old)).toThrow()
    barrier.recoverFence()
    await expect(barrier.run(async () => {})).rejects.toThrow()
    expect(() => barrier.reopen(current)).toThrow()
  })
})
