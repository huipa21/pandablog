import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir, hostname } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
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

  it('refuses to claim writer release when its receipt was replaced', () => fixture(async root => {
    const store = new JobStore(root)
    await store.startWriter()
    const path = join(root, '.writer.lock/owner.json')
    const replaced = {...JSON.parse(await readFile(path, 'utf8')), token: 'c'.repeat(48)}
    await writeFile(path, JSON.stringify(replaced))
    expect(await store.stopWriter()).toBe(false)
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(replaced)
  }))

  it('rechecks disk uncertainty before reporting a clean writer release', () => fixture(async root => {
    const store = new JobStore(root)
    await store.startWriter()
    await new JobStore(root).markUncertain()
    expect(await store.stopWriter()).toBe(false)
    expect(await readFile(join(root, '.writer.lock/owner.json'), 'utf8')).toBeTruthy()
  }))

  it('waits for a same-PID dev generation to release cleanly without removing its receipt', () => fixture(async root => {
    const previous = new JobStore(root), replacement = new JobStore(root)
    await previous.startWriter()
    const receipt = await readFile(join(root, '.writer.lock/owner.json'), 'utf8')
    const acquire = vi.spyOn(replacement, 'startWriter')
    const acquiring = replacement.startWriterAfterDevDrain(() => false, 1000)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(acquire).not.toHaveBeenCalled() // do not compete with old close for its guard
    expect(await readFile(join(root, '.writer.lock/owner.json'), 'utf8')).toBe(receipt)
    await previous.stopWriter()
    expect(await acquiring).toBe(true)
    await replacement.stopWriter()
  }))

  it('dev drain wait is bounded and does not take over a live generation', () => fixture(async root => {
    const previous = new JobStore(root), replacement = new JobStore(root)
    await previous.startWriter()
    const receipt = await readFile(join(root, '.writer.lock/owner.json'), 'utf8')
    await expect(replacement.startWriterAfterDevDrain(() => false, 50)).rejects.toThrow()
    expect(await readFile(join(root, '.writer.lock/owner.json'), 'utf8')).toBe(receipt)
    await previous.stopWriter()
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
