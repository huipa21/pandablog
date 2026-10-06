import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir, hostname } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JobStore } from '../../server/utils/backups/jobMutex'

const job = (id: string) => ({id, kind: 'create' as const, startedAt: new Date().toISOString()})
async function fixture(work: (root: string) => Promise<void>) { const root = await mkdtemp(join(tmpdir(), 'pb-job-owned-')); try {await work(root)} finally {await rm(root, {recursive: true, force: true})} }

describe('durable maintenance ownership', () => {
  it('reserves synchronously and serializes separate contenders', () => fixture(async root => {
    const store = new JobStore(root)
    const results = await Promise.allSettled(Array.from({length: 20}, (_, i) => store.acquire(job(String(i)))))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const owner = store.getActiveJob()!
    await store.release(owner)
    const separate = [new JobStore(root), new JobStore(root)]
    const disk = await Promise.allSettled(separate.map((s, i) => s.acquire(job(String(i)))))
    expect(disk.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    for (const s of separate) if (s.getActiveJob()) await s.release(s.getActiveJob()!)
  }))

  it('does not steal partially published, unreadable or remote ownership by TTL', () => fixture(async root => {
    await mkdir(join(root, '.job.lock'))
    const store = new JobStore(root)
    await expect(store.acquire(job('empty'))).rejects.toMatchObject({statusCode: 409})
    await writeFile(join(root, '.job.lock/owner.json'), 'not JSON')
    await expect(store.acquire(job('corrupt'))).rejects.toThrow()
    await writeFile(join(root, '.job.lock/owner.json'), JSON.stringify({token: 'a'.repeat(48), generation: 'b'.repeat(48), host: 'remote.invalid', pid: 1234, startedAt: '1900-01-01'}))
    await expect(store.acquire(job('remote'))).rejects.toThrow()
  }))

  it('old release cannot delete a new owner, and one dead-local contender wins', () => fixture(async root => {
    const store = new JobStore(root), first = await store.acquire(job('first'))
    await store.release(first)
    const second = await store.acquire(job('second'))
    await store.release(first)
    expect(JSON.parse(await readFile(join(root, '.job.lock/owner.json'), 'utf8')).token).toBe(second.token)
    await store.release(second)
    await mkdir(join(root, '.job.lock'))
    // PID cannot refer to any local live process; no signal is sent (probe 0).
    await writeFile(join(root, '.job.lock/owner.json'), JSON.stringify({token: 'a'.repeat(48), generation: 'b'.repeat(48), host: hostname(), pid: 2147483647}))
    const contenders = [new JobStore(root), new JobStore(root)]
    const result = await Promise.allSettled(contenders.map(s => s.acquire(job('reclaim'))))
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    for (const s of contenders) if (s.getActiveJob()) await s.release(s.getActiveJob()!)
  }))

  it('every unfinished restore remains fenced after restart, with status-only capability', () => fixture(async root => {
    const store = new JobStore(root)
    const owner = await store.acquire({...job('restore'), kind: 'restore'})
    const token = await store.beginRestore(owner)
    await store.transition(owner, {phase: 'db-wipe', destructive: true, artifacts: {safetySql: join(root, 'owned.surql')}})
    await store.release(owner)
    const restarted = new JobStore(root)
    expect(await restarted.loadJournal()).toBe(true)
    expect(await restarted.startWriter()).toBe(false)
    expect(restarted.authorizeStatus(token)).toBe(true)
    expect(restarted.authorizeStatus('c'.repeat(64))).toBe(false)
    await expect(restarted.acquire(job('no'))).rejects.toThrow()
    expect(restarted.getJournal()?.artifacts.safetySql).toContain('owned.surql')
  }))

  it('uncertain writes remain durable and block fresh writer startup', () => fixture(async root => {
    const store = new JobStore(root)
    await store.startWriter()
    await store.markUncertain()
    expect(await new JobStore(root).startWriter()).toBe(false)
  }))

  it('enforces one app writer and persists committed state before release', () => fixture(async root => {
    const store = new JobStore(root)
    expect(await store.startWriter()).toBe(true)
    await expect(new JobStore(root).startWriter()).rejects.toThrow()
    const owner = await store.acquire({...job('restore'), kind: 'restore'})
    await store.beginRestore(owner)
    await store.transition(owner, {phase: 'finalize', state: 'committed'})
    await store.release(owner); await store.stopWriter()
    const restarted = new JobStore(root)
    expect(await restarted.startWriter()).toBe(true)
    await restarted.stopWriter()
  }))
})
