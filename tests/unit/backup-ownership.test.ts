import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir, hostname } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { JobStore } from '../../server/utils/backups/jobMutex'
import { UNCERTAIN_WRITE_QUIESCENCE_MS } from '../../server/utils/maintenance'
const job = (id: string) => ({id, kind: 'create' as const, startedAt: new Date().toISOString()})
async function fixture(work: (root: string) => Promise<void>) {const root = await mkdtemp(join(tmpdir(), 'pb-job-owned-')); try {await work(root)} finally {vi.useRealTimers(); await rm(root, {recursive: true, force: true})}}

describe('serialized job ownership, not application ownership', () => {
  it('reserves synchronously and serializes separate contenders', () => fixture(async root => {
    const store = new JobStore(root)
    const results = await Promise.allSettled(Array.from({length: 20}, (_, i) => store.acquire(job(String(i)))))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    await store.release(store.getActiveJob()!)
    const separate = [new JobStore(root), new JobStore(root)]
    const disk = await Promise.allSettled(separate.map((s, i) => s.acquire(job(String(i)))))
    expect(disk.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    for (const s of separate) if (s.getActiveJob()) await s.release(s.getActiveJob()!)
  }))
  it('does not steal partial, corrupt, remote or live ownership by TTL; site preflight stays available', () => fixture(async root => {
    await mkdir(join(root, '.job.lock'))
    const store = new JobStore(root)
    for (const bytes of [null, 'not JSON', JSON.stringify({token: 'a'.repeat(48), generation: 'b'.repeat(48), host: 'remote.invalid', pid: 1234}), JSON.stringify({token: 'a'.repeat(48), generation: 'b'.repeat(48), host: hostname(), pid: process.pid})]) {
      if (bytes) await writeFile(join(root, '.job.lock/owner.json'), bytes)
      expect(await store.initializeRestoreState()).toBe(true)
      await expect(store.acquire(job('no-steal'))).rejects.toMatchObject({statusCode: 409})
    }
  }))
  it('old release cannot delete successor; one dead-local reclaimer wins', () => fixture(async root => {
    const store = new JobStore(root), first = await store.acquire(job('first'))
    await store.release(first)
    const second = await store.acquire(job('second'))
    await store.release(first)
    expect(JSON.parse(await readFile(join(root, '.job.lock/owner.json'), 'utf8')).token).toBe(second.token)
    await store.release(second)
    await mkdir(join(root, '.job.lock'))
    await writeFile(join(root, '.job.lock/owner.json'), JSON.stringify({token: 'a'.repeat(48), generation: 'b'.repeat(48), host: hostname(), pid: 2147483647}))
    const contenders = [new JobStore(root), new JobStore(root)]
    const result = await Promise.allSettled(contenders.map(s => s.acquire(job('reclaim'))))
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    for (const s of contenders) if (s.getActiveJob()) await s.release(s.getActiveJob()!)
  }))
  it('preserves destructive intent and status-only capability after restart', () => fixture(async root => {
    const store = new JobStore(root), owner = await store.acquire({...job('restore'), kind: 'restore'})
    const token = await store.beginRestore(owner)
    await store.transition(owner, {phase: 'db-wipe', destructive: true})
    await store.release(owner)
    const restarted = new JobStore(root)
    expect(await restarted.initializeRestoreState()).toBe(false)
    expect(restarted.authorizeStatus(token)).toBe(true)
    expect(restarted.authorizeStatus('c'.repeat(64))).toBe(false)
    await expect(restarted.acquire(job('no'))).rejects.toThrow()
  }))
  it('uncertainty is temporary job-only state and does not change ordinary preflight', () => fixture(async root => {
    await new JobStore(root).markUncertain()
    const fresh = new JobStore(root)
    expect(await fresh.initializeRestoreState()).toBe(true)
    await expect(fresh.acquire(job('blocked'))).rejects.toMatchObject({data: {reason: 'uncertain-writes-quiescing'}})
  }))
  it.each(['expired', 'corrupt', 'future'])('expires %s uncertainty without marker removal or polling extension', mode => fixture(async root => {
    vi.useFakeTimers({toFake: ['Date']})
    const bytes = mode === 'corrupt' ? 'broken' : JSON.stringify({updatedAt: new Date(Date.now() + (mode === 'future' ? 60_000 : -UNCERTAIN_WRITE_QUIESCENCE_MS - 1000)).toISOString()})
    await writeFile(join(root, '.uncertain-writes.json'), bytes)
    const store = new JobStore(root)
    expect(await store.initializeRestoreState()).toBe(true)
    if (mode !== 'expired') expect(store.uncertaintyUntil()).toBeGreaterThan(Date.now())
    vi.setSystemTime(Date.now() + UNCERTAIN_WRITE_QUIESCENCE_MS + 1)
    const owner = await store.acquire(job('elapsed'))
    await store.release(owner)
    expect(store.uncertaintyUntil()).toBe(0)
    expect(await readFile(join(root, '.uncertain-writes.json'), 'utf8')).toBe(bytes)
  }))
  it('an abandoned reset cannot immediately overlap lingering execution while app stays up', () => fixture(async root => {
    vi.useFakeTimers({toFake: ['Date']})
    await mkdir(join(root, '.job.lock'))
    const bytes = JSON.stringify({token: 'a'.repeat(48), generation: 'b'.repeat(48), host: hostname(), pid: 2147483647, job: {...job('lost-reset'), kind: 'password-reset'}})
    await writeFile(join(root, '.job.lock/owner.json'), bytes)
    const store = new JobStore(root, 0, UNCERTAIN_WRITE_QUIESCENCE_MS)
    expect(await store.initializeRestoreState()).toBe(true)
    await expect(store.acquire(job('early'))).rejects.toMatchObject({data: {reason: 'abandoned-job-quiescing'}})
    expect(await readFile(join(root, '.job.lock/owner.json'), 'utf8')).toBe(bytes)
    vi.setSystemTime(Date.now() + UNCERTAIN_WRITE_QUIESCENCE_MS + 1)
    const replacement = new JobStore(root, 0, UNCERTAIN_WRITE_QUIESCENCE_MS)
    const owner = await replacement.acquire(job('settled')); await replacement.release(owner)
  }))
  it('new-process hold covers missing crash marker but never readiness', () => fixture(async root => {
    vi.useFakeTimers({toFake: ['Date']})
    const store = new JobStore(root, UNCERTAIN_WRITE_QUIESCENCE_MS)
    expect(await store.initializeRestoreState()).toBe(true)
    await expect(store.acquire(job('early'))).rejects.toMatchObject({data: {reason: 'process-start-quiescing'}})
    vi.setSystemTime(Date.now() + UNCERTAIN_WRITE_QUIESCENCE_MS + 1)
    const owner = await store.acquire(job('late')); await store.release(owner)
  }))
  it('ignores legacy publication guards and reclaims a recognized dead legacy nonrestore file', () => fixture(async root => {
    await mkdir(join(root, '.ownership.guard'))
    await writeFile(join(root, '.job.lock'), JSON.stringify({id: 'legacy', kind: 'create', startedAt: '2000-01-01', host: hostname(), pid: 2147483647}))
    const store = new JobStore(root)
    expect(await store.initializeRestoreState()).toBe(true)
    const owner = await store.acquire(job('new')); await store.release(owner)
    await expect(readFile(join(root, '.ownership.guard'))).rejects.toThrow()
  }))
  it.each(['committed', 'rolled-back', 'aborted'] as const)('accepts verified terminal %s without archival', state => fixture(async root => {
    const store = new JobStore(root), owner = await store.acquire({...job('restore'), kind: 'restore'})
    await store.beginRestore(owner)
    await store.transition(owner, {state, phase: state === 'committed' ? 'finalize' : state === 'rolled-back' ? 'rollback' : 'preparing', destructive: state !== 'aborted'})
    await store.release(owner)
    expect(await new JobStore(root).initializeRestoreState()).toBe(true)
  }))
})
