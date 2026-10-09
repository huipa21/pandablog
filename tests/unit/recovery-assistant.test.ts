import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { createOwnedStorage, fixtureEnvironment } from '../../scripts/backend-hardening/fixture'
import { JobStore } from '../../server/utils/backups/jobMutex'
import { archiveReviewedStartup, inspectRecovery } from '../../scripts/recovery/assistant'
const exec = promisify(execFile)
async function fixture(work: (root: string) => Promise<void>) {const storage = await createOwnedStorage(); try {await mkdir(join(storage.root, 'backups')); await work(storage.root)} finally {await storage.cleanup()}}

describe('restore-oriented read-only recovery inspection', () => {
  it.each(['empty', 'partial', 'corrupt', 'remote', 'live-looking'])('retired %s writer does not require recovery or change records', mode => fixture(async root => {
    await mkdir(join(root, 'backups/.writer.lock'))
    const bytes = mode === 'corrupt' ? 'broken' : JSON.stringify({host: 'remote', pid: process.pid, token: 'never-print-token'})
    const file = join(root, 'backups/.writer.lock', mode === 'partial' ? 'owner.json.tmp' : 'owner.json')
    if (mode !== 'empty') await writeFile(file, bytes)
    const report = await inspectRecovery(root)
    expect(report.status).toBe('clear'); expect(report.canArchiveReviewedStartup).toBe(false)
    expect(JSON.stringify(report)).not.toContain('never-print-token')
    if (mode !== 'empty') expect(await readFile(file, 'utf8')).toBe(bytes)
    expect(await new JobStore(join(root, 'backups')).initializeRestoreState()).toBe(true)
  }))
  it('rejects retired archival before any I/O even with all assertions', () => fixture(async root => {
    await writeFile(join(root, 'backups/unknown'), 'preserve')
    await expect(archiveReviewedStartup(root, {appStopped: true, databaseQuiescent: true, dataConsistent: true})).rejects.toThrow(/retired/)
    expect(await readFile(join(root, 'backups/unknown'), 'utf8')).toBe('preserve')
  }))
  it.each(['running', 'committed', 'rolled-back', 'aborted'] as const)('classifies %s journal by destructive and verified phase', state => fixture(async root => {
    const store = new JobStore(join(root, 'backups')), owner = await store.acquire({id: 'fixture', kind: 'restore', startedAt: new Date().toISOString()})
    await store.beginRestore(owner)
    await store.transition(owner, {state, destructive: state !== 'aborted', phase: state === 'committed' ? 'finalize' : state === 'rolled-back' ? 'rollback' : state === 'aborted' ? 'preparing' : 'db-wipe'})
    const before = await readFile(join(root, 'backups/.restore-journal.json'), 'utf8')
    const report = await inspectRecovery(root)
    expect(report.status).toBe(state === 'running' ? 'manual-recovery-required' : 'clear')
    expect(JSON.stringify(report)).not.toContain(owner.token)
    expect(await readFile(join(root, 'backups/.restore-journal.json'), 'utf8')).toBe(before)
  }))
  it.each(['.restore-journal.json', '.restore-unknown'])('preserves ambiguous %s', name => fixture(async root => {
    await writeFile(join(root, 'backups', name), 'broken')
    expect((await inspectRecovery(root)).status).toBe('manual-recovery-required')
    expect(await readFile(join(root, 'backups', name), 'utf8')).toBe('broken')
  }))
  it('pre-destructive evidence is automatic handling; guard/nonrestore job are informational', () => fixture(async root => {
    await mkdir(join(root, 'backups/.ownership.guard'))
    const store = new JobStore(join(root, 'backups')), owner = await store.acquire({id: 'fixture', kind: 'restore', startedAt: new Date().toISOString()})
    await store.beginRestore(owner)
    expect((await inspectRecovery(root)).status).toBe('clear')
    await store.transition(owner, {state: 'aborted'}); await store.release(owner)
    await writeFile(join(root, 'backups/.job.lock'), JSON.stringify({kind: 'restore'}))
    // File-format restores predate journals: terminal metadata cannot certify it.
    expect((await inspectRecovery(root)).status).toBe('manual-recovery-required')
  }))
  it.skipIf(process.platform === 'win32')('does not follow retired writer symlink; rejects active root symlink', () => fixture(async root => {
    await symlink('/nonexistent-fixture-only', join(root, 'backups/.writer.lock'))
    expect((await inspectRecovery(root)).status).toBe('clear')
    await symlink(join(root, 'backups'), join(root, 'alias'))
    await expect(inspectRecovery(join(root, 'alias'))).rejects.toThrow(/regular directories/)
  }))
  it('development and bundled commands are read-only, env-independent, and refuse old flags', async () => {
    const storage = await createOwnedStorage(), output = await createOwnedStorage()
    try {
      await mkdir(join(storage.root, 'storage/backups'), {recursive: true})
      await mkdir(join(storage.root, 'storage/backups/.writer.lock'))
      await writeFile(join(storage.root, 'storage/backups/.writer.lock/owner.json'), 'retired')
      await writeFile(storage.path('.env'), 'THIS IS NOT VALID DOTENV: never-print-secret')
      await build({entryPoints: [resolve('scripts/recover.ts')], outfile: output.path('recover.cjs'), bundle: true, platform: 'node', format: 'cjs'})
      for (const args of [['--import', pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href, resolve('scripts/recover.ts')], [output.path('recover.cjs')]]) {
        const opts = {cwd: storage.root, env: fixtureEnvironment(), timeout: 10_000}
        const {stdout} = await exec(process.execPath, args, opts)
        expect(stdout).toContain('recovery: clear'); expect(stdout).not.toContain('never-print-secret')
        await expect(exec(process.execPath, [...args, '--archive-reviewed-startup', '--app-stopped', '--database-quiescent', '--data-consistent'], opts)).rejects.toMatchObject({code: 1, stderr: expect.stringContaining('retired')})
        expect(await readFile(join(storage.root, 'storage/backups/.writer.lock/owner.json'), 'utf8')).toBe('retired')
      }
      const {stdout} = await exec(process.execPath, [resolve('bin/panda.mjs'), 'recover', '--help'], {cwd: storage.root, env: fixtureEnvironment()})
      expect(stdout).toContain('read-only restore inspection')
    } finally {await storage.cleanup(); await output.cleanup()}
  }, 20_000)
})
