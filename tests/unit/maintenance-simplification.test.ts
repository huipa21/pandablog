import { mkdir, readFile, writeFile, lstat, symlink, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createOwnedStorage } from '../../scripts/backend-hardening/fixture'
import { JobStore } from '../../server/utils/backups/jobMutex'

async function fixture(work: (root: string) => Promise<void>) {
  const storage = await createOwnedStorage()
  try {await work(storage.root)} finally {await storage.cleanup()}
}
const job = {id: 'fixture', kind: 'restore' as const, startedAt: new Date().toISOString()}

describe('approved ordinary restart versus destructive restore boundary', () => {
  it('Nitro and SSR module evaluations share readiness, leases and cache generation in one Worker realm', async () => {
    vi.resetModules()
    const first = (await import('../../server/utils/maintenance')).writeBarrier
    vi.resetModules()
    const second = (await import('../../server/utils/maintenance')).writeBarrier
    expect(second).toBe(first)
    const owner = {}
    await first.close(owner)
    await expect(second.run(async () => undefined)).rejects.toMatchObject({statusCode: 503})
    first.reopen(owner)
    expect(second.cacheGeneration()).toBe(first.cacheGeneration())
  })
  it('shutdown does not certify undrained restore FS work or allow its late reopen', async () => {
    vi.useFakeTimers()
    const {WriteBarrier} = await import('../../server/utils/maintenance')
    const {StartupCoordinator} = await import('../../server/utils/startup')
    const barrier = new WriteBarrier(), startup = new StartupCoordinator(barrier)
    let finish!: () => void
    const pending = new Promise<void>(resolve => {finish = resolve})
    try {
      await startup.start({validate: () => {}, checkRestore: async () => true, dispose: async () => {}})
      await startup.initialize(async () => {})
      const owner = {}
      await barrier.close(owner)
      const work = barrier.runOwner(owner, async () => {await pending; barrier.reopen(owner)})
      const closing = startup.stop(10)
      await vi.advanceTimersByTimeAsync(11); await closing
      const certified = startup.shutdownDrained()
      finish(); await work.catch(() => {})
      expect(certified).toBe(false)
      expect(barrier.status().closed).toBe(true)
    } finally {finish(); vi.useRealTimers()}
  })
  it('ignores an unchanged corrupt retired writer receipt', () => fixture(async root => {
    await mkdir(join(root, '.writer.lock'))
    await writeFile(join(root, '.writer.lock/owner.json'), 'retired-corrupt-receipt')
    expect(await new JobStore(root).initializeRestoreState()).toBe(true)
    expect(await readFile(join(root, '.writer.lock/owner.json'), 'utf8')).toBe('retired-corrupt-receipt')
  }))
  it('does not publish application ownership on clean initialization', () => fixture(async root => {
    expect(await new JobStore(root).initializeRestoreState()).toBe(true)
    await expect(readFile(join(root, '.writer.lock/owner.json'))).rejects.toMatchObject({code: 'ENOENT'})
  }))
  it('automatically aborts a trustworthy interrupted pre-destructive restore', () => fixture(async root => {
    const store = new JobStore(root), owner = await store.acquire(job)
    await store.beginRestore(owner)
    await store.transition(owner, {phase: 'db-validate'})
    expect(await new JobStore(root).initializeRestoreState()).toBe(true)
    expect(JSON.parse(await readFile(join(root, '.restore-journal.json'), 'utf8')).state).toBe('aborted')
  }))
  it.each(['file', 'empty-directory', 'partial', 'remote', 'live-looking', 'reused-pid'])('retired %s writer objects remain unchanged and never gate boot', mode => fixture(async root => {
    const writer = join(root, '.writer.lock')
    const bytes = JSON.stringify({host: mode === 'remote' ? 'different-container' : 'local', pid: process.pid, token: 'retired'})
    if (mode === 'file') await writeFile(writer, bytes)
    else {
      await mkdir(writer)
      if (mode !== 'empty-directory') await writeFile(join(writer, mode === 'partial' ? 'owner.json.tmp' : 'owner.json'), bytes)
    }
    expect(await new JobStore(root).initializeRestoreState()).toBe(true)
    if (mode === 'file') expect(await readFile(writer, 'utf8')).toBe(bytes)
    else {
      expect((await lstat(writer)).isDirectory()).toBe(true)
      if (mode !== 'empty-directory') expect(await readFile(join(writer, mode === 'partial' ? 'owner.json.tmp' : 'owner.json'), 'utf8')).toBe(bytes)
    }
  }))
  it.skipIf(process.platform === 'win32')('ignores unreadable retired directories and symlinks without traversal', () => fixture(async root => {
    const writer = join(root, '.writer.lock')
    await symlink('/nonexistent-owned-fixture-target', writer)
    expect(await new JobStore(root).initializeRestoreState()).toBe(true)
    expect((await lstat(writer)).isSymbolicLink()).toBe(true)
    const guard = join(root, '.ownership.guard')
    await mkdir(guard); await chmod(guard, 0)
    try {expect(await new JobStore(root).initializeRestoreState()).toBe(true)} finally {await chmod(guard, 0o700)}
  }))
  it.each(['pre-swap', 'unsafe-path', 'false-terminal', 'missing-journal', 'legacy-swap', 'legacy-sql'])('preserves ambiguous %s restore evidence', mode => fixture(async root => {
    if (mode === 'missing-journal') await writeFile(join(root, '.job.lock'), JSON.stringify({id: 'old', kind: 'restore'}))
    else if (mode === 'legacy-swap' || mode === 'legacy-sql') {
      await mkdir(join(root, '.safety'))
      if (mode === 'legacy-swap') await mkdir(join(root, '.safety/pre-restore-uploads-fixture-123'))
      else await writeFile(join(root, '.safety/pre-restore-fixture-123.surql'), 'legacy producer has no destructive intent flag')
    }
    else {
      const store = new JobStore(root), owner = await store.acquire(job)
      await store.beginRestore(owner)
      if (mode === 'pre-swap') {await mkdir(join(root, `.restore-${owner.token}`)); await mkdir(join(root, `.restore-${owner.token}/old-uploads`))}
      if (mode === 'unsafe-path') await store.transition(owner, {artifacts: {safetySql: join(root, '../not-owned.surql')}})
      if (mode === 'false-terminal') await store.transition(owner, {state: 'committed', destructive: false, phase: 'finalize'})
    }
    expect(await new JobStore(root).initializeRestoreState()).toBe(false)
  }))
  it('historical SQL-only safety is untouched and is not a generic crash latch', () => fixture(async root => {
    await mkdir(join(root, '.safety'))
    await writeFile(join(root, '.safety/historical-export.surql'), 'synthetic safety SQL')
    expect(await new JobStore(root).initializeRestoreState()).toBe(true)
    expect(await readFile(join(root, '.safety/historical-export.surql'), 'utf8')).toBe('synthetic safety SQL')
  }))
  it('preserves destructive intent even before first wipe dispatch', () => fixture(async root => {
    const store = new JobStore(root), owner = await store.acquire(job)
    await store.beginRestore(owner)
    await store.transition(owner, {phase: 'db-wipe', destructive: true})
    const before = await readFile(join(root, '.restore-journal.json'), 'utf8')
    expect(await new JobStore(root).loadJournal()).toBe(true)
    expect(await readFile(join(root, '.restore-journal.json'), 'utf8')).toBe(before)
  }))
})
