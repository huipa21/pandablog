import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { boundedText } from './http'

export const NODE_VERSION = '22.22.0'
// Reproducible CI/default artifact; user-approved local range is stable 3.2.x.
export const SURREAL_VERSION = '3.2.4'
const exec = promisify(execFile)
const testName = /^pb_rev_test_[a-f0-9]{32}$/

export function assertOptIn(value: string | undefined) {
  if (value !== '1') throw new Error('Disposable fixture requires explicit --fixture opt-in')
}

export function assertRuntime(value = process.version) {
  if (value !== `v${NODE_VERSION}`) throw new Error(`Fixture requires Node ${NODE_VERSION}; received ${value}`)
}

export function assertSurrealVersion(value: string) {
  if (!/^3\.2\.(?:0|[1-9]\d*)(?:\+[\w.-]+)?(?:\s|$)/.test(value.trim().replace(/^surrealdb-/, ''))) throw new Error(`Fixture requires stable SurrealDB 3.2.x (default pin ${SURREAL_VERSION})`)
}

export function assertFixtureTarget(endpoint: string, namespace: string, database: string) {
  // Validate the literal input too: URL normalization must not accept 127.1 etc.
  if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(endpoint)) throw new Error('Fixture endpoint must be explicit IPv4 loopback, with port only')
  const url = new URL(endpoint)
  if (!url.port || Number(url.port) > 65535 || !testName.test(namespace) || !testName.test(database)) throw new Error('Refusing non-test fixture target')
}

// Do not inherit application credentials, .env loaders, DB flags or NODE_OPTIONS.
export function fixtureEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(source)) {
    if (/^(path|systemroot|windir|comspec|pathext|temp|tmp|lang|lc_all)$/i.test(key) && value !== undefined) result[key] = value
  }
  return result
}

export interface OwnedStorage {
  readonly root: string
  path: (name: string) => string
  verify: () => Promise<void>
  cleanup: () => Promise<void>
}

export async function createOwnedStorage(): Promise<OwnedStorage> {
  const parent = await realpath(tmpdir())
  const root = await realpath(await mkdtemp(join(parent, 'pb-backend-fixture-')))
  const token = randomBytes(32).toString('hex')
  await writeFile(join(root, '.owner'), token, { flag: 'wx', mode: 0o600 })
  let removed = false
  const verify = async () => {
    if (removed) throw new Error('Fixture storage already removed')
    const stat = await lstat(root)
    const receipt = await lstat(join(root, '.owner'))
    if (!stat.isDirectory() || stat.isSymbolicLink() || !receipt.isFile() || receipt.isSymbolicLink() ||
        await realpath(root) !== root || dirname(root) !== parent || !basename(root).startsWith('pb-backend-fixture-') ||
        await readFile(join(root, '.owner'), 'utf8') !== token) throw new Error('Fixture ownership validation failed; refusing cleanup/use')
  }
  return {
    root,
    path(name) {
      if (removed || !/^[a-zA-Z0-9_.-]+$/.test(name) || name === '.' || name === '..') throw new Error('Unsafe fixture storage path')
      return join(root, name)
    },
    verify,
    async cleanup() {
      if (removed) return
      await verify()
      await rm(root, { recursive: true })
      removed = true
    }
  }
}

async function unusedPort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No disposable fixture port')
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return address.port
}

export async function startFixture(options: { enabled: string | undefined, binary: string }) {
  assertOptIn(options.enabled)
  assertRuntime()
  if (!isAbsolute(options.binary) || !(await lstat(options.binary)).isFile()) throw new Error('Supply an explicit absolute SurrealDB binary path')
  const binary = await realpath(options.binary)
  const storage = await createOwnedStorage()
  const env = fixtureEnvironment()
  let child: ReturnType<typeof spawn> | undefined
  let exited: Promise<void> | undefined
  let stopPromise: Promise<void> | undefined
  let spawnError: Error | undefined
  const waitForExit = async (promise: Promise<void>) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([promise.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 5000) })])
    } finally { clearTimeout(timer) }
  }
  const stop = () => stopPromise ??= (async () => {
    if (child && exited) {
      if (child.exitCode === null && child.signalCode === null && !spawnError) {
        child.kill('SIGTERM')
        if (!await waitForExit(exited)) child.kill('SIGKILL')
      }
      if (!await waitForExit(exited)) throw new Error('Owned fixture process did not stop; directory preserved')
    }
    await storage.cleanup()
  })()
  try {
    const version = await exec(binary, ['version'], { cwd: storage.root, env, timeout: 5000, maxBuffer: 4096 })
    assertSurrealVersion(version.stdout)
    const port = await unusedPort()
    const endpoint = `http://127.0.0.1:${port}`
    const namespace = `pb_rev_test_${randomBytes(16).toString('hex')}`
    const database = `pb_rev_test_${randomBytes(16).toString('hex')}`
    const username = `fixture_${randomBytes(16).toString('hex')}`
    const password = randomBytes(32).toString('hex')
    assertFixtureTarget(endpoint, namespace, database)
    // No persistent app path, root defaults, containers or external endpoint inputs.
    child = spawn(binary, ['start', '--bind', `127.0.0.1:${port}`, '--user', username, '--pass', password, '--log', 'error', 'memory'], { cwd: storage.root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.on('error', error => { spawnError = error })
    exited = new Promise<void>(resolve => { child!.once('close', () => resolve()) })
    // Drain pipes, but retain no potentially growing diagnostic log (or credentials).
    child.stdout!.resume()
    child.stderr!.resume()
    const deadline = Date.now() + 20_000
    let ready = false
    while (Date.now() < deadline) {
      if (spawnError || child.exitCode !== null || child.signalCode !== null) throw new Error('Owned fixture process failed during startup')
      try {
        const response = await fetch(`${endpoint}/version`, { signal: AbortSignal.timeout(500), redirect: 'error' })
        const body = await boundedText(response, 4096)
        if (response.ok) {
          assertSurrealVersion(body)
          ready = true
          break
        }
      } catch { /* polling only the generated loopback port */ }
      await delay(50)
    }
    if (!ready) throw new Error('Owned fixture startup deadline exceeded')
    if (spawnError || child.exitCode !== null || child.signalCode !== null) throw new Error('Owned fixture process failed during startup readiness')
    const pid = child.pid!
    return { endpoint, namespace, database, username, password, storage, pid, stop }
  } catch (error) {
    await stop()
    throw error
  }
}

export type Fixture = Awaited<ReturnType<typeof startFixture>>

export async function fixtureRss(pid: number): Promise<number> {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid owned process PID')
  if (process.platform === 'win32') {
    const result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).WorkingSet64`], { env: fixtureEnvironment(), timeout: 5000, maxBuffer: 4096 })
    const bytes = Number(result.stdout.trim())
    if (!Number.isFinite(bytes) || bytes <= 0) throw new Error('Cannot measure fixture DB RSS')
    return bytes
  }
  const result = await exec('ps', ['-o', 'rss=', '-p', String(pid)], { env: fixtureEnvironment(), timeout: 5000, maxBuffer: 4096 })
  const bytes = Number(result.stdout.trim()) * 1024
  if (!Number.isFinite(bytes) || bytes <= 0) throw new Error('Cannot measure fixture DB RSS')
  return bytes
}
