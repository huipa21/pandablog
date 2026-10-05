import { execFile, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startFixture } from '../../scripts/backend-hardening/fixture'

const control = vi.hoisted(() => ({ version: '3.2.4 for test on x86_64', kills: 0, failSpawn: false }))
vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    execFile: vi.fn((_binary, _args, _options, callback) => callback(null, { stdout: control.version, stderr: '' })),
    spawn: vi.fn(() => {
      const child = Object.assign(new EventEmitter(), {
        pid: 500_000, exitCode: null as number | null, signalCode: null,
        stdout: { resume() {} }, stderr: { resume() {} },
        kill() {
          control.kills++
          child.exitCode = 0
          queueMicrotask(() => child.emit('close', 0))
          return true
        }
      })
      if (control.failSpawn) queueMicrotask(() => { child.emit('error', new Error('injected spawn failure')); child.emit('close', -1) })
      return child
    })
  }
})
// This unit test never launches a DB; it separately proves failure cleanup.
// Inject the process version only here so Node 24 default units stay usable;
// real integration never bypasses the Node pin.
const originalProcess = process
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); control.version = '3.2.4 for test on x86_64'; control.kills = 0; control.failSpawn = false })
function prepare() {
  vi.stubGlobal('process', { ...originalProcess, version: 'v22.22.0' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('3.2.4')))
}

describe('owned fixture process lifecycle (mocked process, real temp FS)', () => {
  it('starts/stops twice, uses generated credentials/targets and closes only owned processes once', async () => {
    prepare()
    const identities = new Set<string>()
    for (let cycle = 0; cycle < 2; cycle++) {
      const fixture = await startFixture({ enabled: '1', binary: originalProcess.execPath })
      expect(identities.has(fixture.database)).toBe(false)
      identities.add(fixture.database)
      expect(fixture.password).toHaveLength(64)
      const calls = vi.mocked(spawn).mock.calls
      const args = calls.at(-1)![1]
      expect(args).toContain('memory')
      expect(args).toContain(fixture.endpoint.replace('http://', ''))
      expect(calls.at(-1)![2]?.cwd).toBe(fixture.storage.root)
      await Promise.all([fixture.stop(), fixture.stop()])
      expect(control.kills).toBe(cycle + 1)
      await expect(readFile(join(fixture.storage.root, '.owner'))).rejects.toThrow()
    }
  })

  it('cleans owned storage on version mismatch, without launching a server', async () => {
    prepare()
    control.version = '3.3.0'
    await expect(startFixture({ enabled: '1', binary: originalProcess.execPath })).rejects.toThrow(/stable SurrealDB 3\.2\.x/)
    expect(spawn).not.toHaveBeenCalled()
    const cwd = vi.mocked(execFile).mock.calls[0]![2] as { cwd: string }
    await expect(readFile(join(cwd.cwd, '.owner'))).rejects.toThrow()
  })

  it('cleans storage and consumes errors after failed spawn, without signaling another process', async () => {
    prepare()
    control.failSpawn = true
    await expect(startFixture({ enabled: '1', binary: originalProcess.execPath })).rejects.toThrow(/startup/)
    expect(control.kills).toBe(0)
    const cwd = vi.mocked(execFile).mock.calls[0]![2] as { cwd: string }
    await expect(readFile(join(cwd.cwd, '.owner'))).rejects.toThrow()
  })
})
