/** Opt-in owned SOURCE-copy Nuxt build/dev smoke. Never uses configured app data. */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { chromium } from '@playwright/test'
import { assertRuntime, createOwnedStorage, fixtureEnvironment, startFixture } from './fixture'
import { JobStore } from '../../server/utils/backups/jobMutex'
import { browserSmoke, type BrowserFixtureInput } from './maintenance-browser'

const exec = promisify(execFile)
const profiles = new Set(['full', 'minimal', 'no-backups', 'no-observers'])
async function port() {
  const server = createServer()
  await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes))
  const value = (server.address() as {port: number}).port
  await new Promise<void>(yes => server.close(() => yes()))
  return value
}
async function main() {
  const args = process.argv.slice(2), profile = args.find(arg => arg.startsWith('--profile='))?.slice(10), mode = args.find(arg => arg.startsWith('--mode='))?.slice(7)
  const binary = args.find(arg => arg.startsWith('--surreal-bin='))?.slice(14)
  const skipBrowser = args.includes('--skip-browser')
  const windowsNode = args.find(arg => arg.startsWith('--browser-windows-node='))?.slice(23)
  const windowsModule = args.find(arg => arg.startsWith('--browser-windows-module='))?.slice(25)
  if (!args.includes('--fixture') || !profile || !profiles.has(profile) || !['build', 'dev'].includes(mode ?? '') || !binary || args.length !== 4 + Number(skipBrowser) + Number(Boolean(windowsNode)) + Number(Boolean(windowsModule)) || Boolean(windowsNode) !== Boolean(windowsModule) || (skipBrowser && windowsNode)) throw new Error('Use --fixture --profile=full|minimal|no-backups|no-observers --mode=build|dev --surreal-bin=/absolute/binary [--skip-browser | --browser-windows-node=/mnt/c/.../node.exe --browser-windows-module=C:/.../node_modules/playwright-core/index.mjs]')
  if (windowsNode && (process.platform !== 'linux' || !/^\/mnt\/[a-z]\/.*\/node\.exe$/.test(windowsNode) || !/^[A-Za-z]:[/\\].*[/\\]node_modules[/\\]playwright-core[/\\]index\.mjs$/.test(windowsModule!) || /[#?]/.test(windowsModule!))) throw new Error('Explicit Windows browser bridge paths are invalid')
  assertRuntime()
  const source = resolve('.'), storage = await createOwnedStorage()
  let db: Awaited<ReturnType<typeof startFixture>> | undefined
  let app: ChildProcess | undefined, exited: Promise<void> | undefined
  let diagnostic = '', interrupted = false
  let building: ChildProcess | undefined
  const interrupt = () => {interrupted = true; building?.kill('SIGKILL'); app?.kill('SIGKILL')}
  process.once('SIGTERM', interrupt); process.once('SIGINT', interrupt)
  const secrets: string[] = []
  const safe = (text: string) => secrets.reduce((result, secret) => result.replaceAll(secret, '[fixture-redacted]'), text)
  async function stopApp(force = false) {
    if (!app || !exited) return
    if (app.exitCode === null && app.signalCode === null) app.kill(force ? 'SIGKILL' : 'SIGTERM')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {await Promise.race([exited, new Promise<never>((_, no) => {timer = setTimeout(() => {app?.kill('SIGKILL'); no(new Error('Owned app closure deadline; storage preserved'))}, 30_000)})])}
    finally {clearTimeout(timer)}
    app = undefined
  }
  try {
    await storage.verify()
    const listing = await exec('git', ['ls-files', '--cached', '-z'], {cwd: source, env: fixtureEnvironment(), maxBuffer: 4 * 1024 * 1024})
    // Only tracked source plus this assignment's explicitly approved new code.
    // Never sweep arbitrary untracked config, accounts or deployment storage.
    const files = [...new Set([...listing.stdout.split('\0').filter(Boolean), 'server/utils/dev-handoff.ts', 'tests/helpers/maintenance-realm.ts', 'tests/unit/maintenance-simplification.test.ts', 'scripts/backend-hardening/maintenance-app.ts', 'scripts/backend-hardening/maintenance-browser.ts',
      'server/utils/backups/contracts.ts', 'server/utils/backups/manifest.ts', 'server/utils/backups/bundle.ts', 'server/utils/backups/snapshotReads.ts', 'server/utils/backups/snapshot.ts', 'server/utils/backups/package.ts', 'server/utils/backups/publication.ts',
      'server/api/admin/backups/[id]/download.get.ts', 'server/api/admin/backups/[id]/download.head.ts'])]
    if (files.length > 20_000) throw new Error('Source-copy file budget exceeded')
    for (const file of files) {
      if (interrupted) throw new Error('Owned fixture interrupted')
      if (/(^|\/)(?:\.env(?:\.|$)|storage\/|app-storage\/)/.test(file) || /^(?:\.git(?:\/|$)|public\/uploads\/|node_modules\/|\.nuxt\/|\.output\/|\.data\/|test-results\/)/.test(file) || file === 'pandablog.modules.json' || file.endsWith('.pem')) continue
      if (file.split('/').some(part => part === '..')) throw new Error('Unsafe source path')
      const from = join(source, file), to = join(storage.root, file)
      // These tracked files are deliberately retired by the full-only task.
      // Do not silently skip other missing/unrecognized source files.
      if (['server/utils/backups/chain.ts', 'server/api/admin/backups/tables.get.ts'].includes(file)) continue
      const stat = await lstat(from)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Source-copy requires regular tracked files')
      await mkdir(dirname(to), {recursive: true}); await copyFile(from, to)
    }
    await symlink(join(source, 'node_modules'), storage.path('node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    const modules: Record<string, unknown> = {}
    for (const name of ['editor', 'logs', 'analytics', 'users', 'themes', 'mfa', 'securityAlerts', 'backups', 'graphView', 'publishActivityHeatmap', 'postVersioning']) modules[name] = {enabled: profile !== 'minimal'}
    modules.users = {enabled: profile !== 'minimal', multiUser: profile !== 'minimal'}
    if (profile === 'no-backups') modules.backups = {enabled: false}
    if (profile === 'no-observers') {modules.logs = {enabled: false}; modules.analytics = {enabled: false}}
    await writeFile(storage.path('pandablog.modules.json'), JSON.stringify({version: 1, modules}))
    if (mode === 'dev') await writeFile(join(storage.root, 'server/api/ms-owned-probe.get.ts'), "export default defineEventHandler(() => ({generation: 1}));")
    db = await startFixture({enabled: '1', binary})
    const appPort = await port(), base = `http://127.0.0.1:${appPort}`, password = randomBytes(24).toString('hex'), session = randomBytes(32).toString('hex'), scoped = randomBytes(24).toString('hex')
    secrets.push(password, session, scoped, db.password)
    const env = {...fixtureEnvironment(), NODE_ENV: mode === 'build' ? 'production' : 'development', APP_VERSION: 'maintenance-fixture.dirty', HOST: '127.0.0.1', PORT: String(appPort), NITRO_HOST: '127.0.0.1', NITRO_PORT: String(appPort),
      NUXT_SURREAL_URL: `${db.endpoint.replace('http:', 'ws:')}/rpc`, NUXT_SURREAL_NAMESPACE: db.namespace, NUXT_SURREAL_DATABASE: db.database, NUXT_SURREAL_ROOT: db.username, NUXT_SURREAL_ROOT_PASSWORD: db.password,
      NUXT_SURREAL_APP_USER: 'owned_app', NUXT_SURREAL_APP_PASSWORD: scoped, NUXT_SESSION_PASSWORD: session, NUXT_APP_ORIGIN: base, NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY: 'false'}
    const cli = join(source, 'node_modules/@nuxt/cli/bin/nuxi.mjs')
    if (mode === 'build') {
      const build = building = spawn(process.execPath, [cli, 'build', '--dotenv=false'], {cwd: storage.root, env, stdio: ['ignore', 'pipe', 'pipe']})
      const timer = setTimeout(() => build.kill('SIGKILL'), 180_000)
      for (const pipe of [build.stdout!, build.stderr!]) pipe.on('data', bytes => {diagnostic = (diagnostic + String(bytes)).slice(-64 * 1024)})
      const code = await new Promise<number | null>((yes, no) => {build.once('error', no); build.once('close', yes)})
      clearTimeout(timer)
      building = undefined
      if (code !== 0) throw new Error(`Owned ${profile} build failed (${code}); ${safe(diagnostic.slice(-8192))}`)
    }
    const launch = () => {
      diagnostic = ''
      app = spawn(process.execPath, mode === 'build' ? [join(storage.root, '.output/server/index.mjs')] : [cli, 'dev', '--host', '127.0.0.1', '--port', String(appPort), '--dotenv=false', '--no-clear', '--no-fork'], {cwd: storage.root, env, stdio: ['ignore', 'pipe', 'pipe']})
      for (const pipe of [app.stdout!, app.stderr!]) pipe.on('data', bytes => {diagnostic = (diagnostic + String(bytes)).slice(-64 * 1024)})
      exited = new Promise<void>(yes => app!.once('close', () => yes()))
    }
    const get = (route: string) => fetch(`${base}${route}`, {signal: AbortSignal.timeout(45_000), redirect: 'manual'})
    const ready = async () => {
      const deadline = Date.now() + 90_000
      while (!interrupted && Date.now() < deadline && app?.exitCode === null) {
        try {if ((await get('/api/ready')).status === 200) return} catch { /* generated loopback only */ }
        await delay(100)
      }
      throw new Error(`Owned Nuxt readiness deadline: ${safe(diagnostic.slice(-8192))}`)
    }
    launch(); await ready()
    for (const route of ['/', '/login', '/api/health']) if ((await get(route)).status !== 200) throw new Error(`Owned route ${route} failed`)
    if (await lstat(join(storage.root, 'storage/backups/.writer.lock')).then(() => true, () => false)) throw new Error('Application created writer receipt')
    const setup = await fetch(`${base}/api/auth/setup`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: base}, body: JSON.stringify({password, confirm_password: password}), signal: AbortSignal.timeout(20_000)})
    if (setup.status !== 200) throw new Error(`Owned setup refused: ${setup.status}`)
    if (!skipBrowser) {
      const labels: BrowserFixtureInput['labels'] = {}
      for (const locale of ['en', 'zh-CN']) {
        const value = JSON.parse(await readFile(join(storage.root, `i18n/locales/${locale}.json`), 'utf8'))
        labels[locale] = {dashboard: value.admin.nav.dashboard, hold: value.admin.backups.jobsQuiescing.split('{until}')[0], createBackup: value.admin.backups.createBackup, importBackup: value.admin.backups.importBackup, settings: value.admin.backups.settings, noBackups: value.admin.backups.noBackups, loadFailed: value.admin.backups.loadFailed}
      }
      const input = {base, password, profile, labels}
      if (windowsNode && windowsModule) {
        const version = await exec(windowsNode, ['--version'], {env: fixtureEnvironment(), timeout: 10_000})
        if (version.stdout.trim() !== 'v22.22.0') throw new Error('Windows browser bridge requires Node 22.22.0')
        await writeFile(storage.path('browser-input.json'), JSON.stringify(input), {mode: 0o600})
        const library = new URL(`file:///${windowsModule.replaceAll('\\', '/')}`).href
        await writeFile(storage.path('browser.mjs'), `import {readFile} from 'node:fs/promises'; import {chromium} from ${JSON.stringify(library)}; const input=JSON.parse(await readFile(process.argv[2],'utf8')); await (${browserSmoke.toString()})(chromium,input);`)
        const script = (await exec('wslpath', ['-w', storage.path('browser.mjs')], {env: fixtureEnvironment()})).stdout.trim()
        const data = (await exec('wslpath', ['-w', storage.path('browser-input.json')], {env: fixtureEnvironment()})).stdout.trim()
        await exec(windowsNode, [script, data], {env: fixtureEnvironment(), timeout: 180_000, maxBuffer: 8192})
      } else await browserSmoke(chromium, input)
    }
    if (mode === 'dev') {
      const probe = join(storage.root, 'server/api/ms-owned-probe.get.ts')
      await writeFile(probe, 'export default defineEventHandler(() => ({generation: 2}));')
      const deadline = Date.now() + 60_000
      let reloaded = false
      while (Date.now() < deadline) {
        try {if ((await (await get('/api/ms-owned-probe')).json()).generation === 2) {reloaded = true; break}} catch { /* reload's bounded unavailable period */ }
        await delay(100)
      }
      if (!reloaded) throw new Error('Owned actual dev watcher reload failed')
      await ready()
    } else {
      await stopApp(true); launch(); await ready() // ordinary production crash
      await stopApp()
      await mkdir(join(storage.root, 'storage/backups/.writer.lock'), {recursive: true})
      await writeFile(join(storage.root, 'storage/backups/.writer.lock/owner.json'), 'retired corrupt owner')
      launch(); await ready()
      if (await readFile(join(storage.root, 'storage/backups/.writer.lock/owner.json'), 'utf8') !== 'retired corrupt owner') throw new Error('Legacy receipt changed')
    }
    await stopApp()
    const restore = new JobStore(join(storage.root, 'storage/backups'))
    const owner = await restore.acquire({id: 'owned-interrupted', kind: 'restore', startedAt: new Date().toISOString()})
    await restore.beginRestore(owner); await restore.transition(owner, {phase: 'db-wipe', destructive: true})
    launch()
    const fenceDeadline = Date.now() + 90_000
    let fenced = false
    while (!interrupted && Date.now() < fenceDeadline) {
      try {
        const response = await get('/api/ready'), state = await response.json() as {state?: string, guidance?: {recoveryRequired?: boolean}}
        if (response.status === 503 && state.state === 'recovery-required' && state.guidance?.recoveryRequired === true) {fenced = true; break}
      } catch { /* owned startup */ }
      await delay(100)
    }
    if (!fenced || (await get('/api/auth/setup')).status !== 503) throw new Error('Actual Nuxt destructive restore was not fenced (including disabled-backups profiles)')
    console.info(JSON.stringify({evidence: 'owned-full-Nuxt-DB-browser-not-deployment', profile, mode, node: process.version, routes: skipBrowser ? 'public/login/health HTTP; browser explicitly skipped' : 'public/login/admin/status en/zh-CN', browser: !skipBrowser, ordinaryCrash: mode === 'build', watcherReload: mode === 'dev', destructiveFence: true}))
  } finally {
    process.removeListener('SIGTERM', interrupt); process.removeListener('SIGINT', interrupt)
    await stopApp(); await db?.stop(); await storage.cleanup()
  }
}
main().catch(error => {console.error(error instanceof Error ? error.message : 'Owned app fixture failed'); process.exitCode = 1})
