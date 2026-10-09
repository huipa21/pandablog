import { spawn } from 'node:child_process'
import { mkdtemp, rm, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fixtureEnvironment } from '../../scripts/backend-hardening/fixture'
import { JobStore } from '../../server/utils/backups/jobMutex'

// Actual owned-process death + durable FS journals. No DB process/data is
// touched; actual DB/media rollback is independently tested by integration.
describe('restore checkpoint process-crash recovery fence', () => {
  it.each(['create', 'import', 'consolidate', 'password-reset'])('ordinary %s crash permits site initialization and token-safe later jobs', async kind => {
    const root = await mkdtemp(join(tmpdir(), 'pb-job-crash-owned-'))
    const module = new URL('../../server/utils/backups/jobMutex.ts', import.meta.url).href
    const program = `const {JobStore}=await import(${JSON.stringify(module)}); const store=new JobStore(${JSON.stringify(root)}); await store.acquire({id:'owned-job',kind:${JSON.stringify(kind)},startedAt:new Date().toISOString()}); process.stdout.write('owned-job-ready'); setInterval(()=>{},1000);`
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {env: fixtureEnvironment(), stdio: ['ignore', 'pipe', 'pipe']})
    const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
    child.stderr.resume()
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Owned job checkpoint deadline')), 10_000)
        child.once('error', error => {clearTimeout(timer); reject(error)})
        child.once('exit', () => {clearTimeout(timer); reject(new Error('Owned job exited early'))})
        child.stdout.once('data', () => {clearTimeout(timer); resolve()})
      })
      const app = new JobStore(root), reset = new JobStore(root)
      expect(await app.initializeRestoreState()).toBe(true)
      await expect(app.acquire({id: 'app', kind: 'create', startedAt: new Date().toISOString()})).rejects.toThrow()
      await expect(reset.acquire({id: 'second-reset', kind: 'password-reset', startedAt: new Date().toISOString()})).rejects.toThrow()
      child.kill('SIGKILL'); await closed
      expect(await new JobStore(root).initializeRestoreState()).toBe(true)
      await expect(lstat(join(root, '.writer.lock'))).rejects.toMatchObject({code: 'ENOENT'})
      const contenders = [app, reset]
      const outcomes = await Promise.allSettled(contenders.map(store => store.acquire({id: 'successor', kind: 'password-reset', startedAt: new Date().toISOString()})))
      expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      for (const store of contenders) if (store.getActiveJob()) await store.release(store.getActiveJob()!)
    } finally {if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await closed; await rm(root, {recursive: true, force: true})}
  }, 15_000)
  it.each(['preparing', 'db-validate', 'safety-snapshot', 'db-wipe', 'db-restore', 'db-verify', 'media-restore', 'finalize', 'rollback'])('stays closed after process death at %s', async phase => {
    const root = await mkdtemp(join(tmpdir(), 'pb-crash-owned-'))
    const module = new URL('../../server/utils/backups/jobMutex.ts', import.meta.url).href
    const program = `const {JobStore}=await import(${JSON.stringify(module)}); const store=new JobStore(${JSON.stringify(root)}); await store.initializeRestoreState(); const owner=await store.acquire({id:'owned-crash',kind:'restore',startedAt:new Date().toISOString()}); await store.beginRestore(owner); await store.transition(owner,{phase:${JSON.stringify(phase)},destructive:${!['preparing', 'db-validate', 'safety-snapshot'].includes(phase)}}); process.stdout.write('checkpoint-ready\\n'); setInterval(()=>{},1000);`
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {env: fixtureEnvironment(), stdio: ['ignore', 'pipe', 'pipe']})
    const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
    child.stderr.resume()
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Owned crash fixture checkpoint deadline')), 10_000)
        const finish = (error?: Error) => {clearTimeout(timer); if (error) reject(error); else resolve()}
        child.once('error', finish)
        child.once('exit', () => finish(new Error('Owned crash fixture exited before checkpoint')))
        child.stdout.once('data', () => finish())
      })
      child.kill('SIGKILL') // only the child just created above
      await closed
      const restarted = new JobStore(root)
      const destructive = !['preparing', 'db-validate', 'safety-snapshot'].includes(phase)
      expect(await restarted.initializeRestoreState()).toBe(!destructive)
      expect(restarted.getJournal()?.phase).toBe(phase)
      if (destructive) await expect(restarted.acquire({id: 'must-not-write', kind: 'create', startedAt: new Date().toISOString()})).rejects.toThrow()
      else {
        expect(restarted.getJournal()?.state).toBe('aborted')
        const owner = await restarted.acquire({id: 'ordinary-job', kind: 'create', startedAt: new Date().toISOString()})
        await restarted.release(owner)
      }
    } finally {if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await closed; await rm(root, {recursive: true, force: true})}
  }, 15_000)
})
