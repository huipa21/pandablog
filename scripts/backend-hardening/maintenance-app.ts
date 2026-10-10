/** Opt-in owned SOURCE-copy Nuxt build/dev smoke. Never uses configured app data. */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { chromium } from '@playwright/test'
import { Surreal } from 'surrealdb'
import { assertRuntime, createOwnedStorage, fixtureEnvironment, startFixture } from './fixture'
import { JobStore } from '../../server/utils/backups/jobMutex'
import { browserSmoke, type BrowserFixtureInput } from './maintenance-browser'

const exec = promisify(execFile)
const profiles = new Set(['full', 'minimal', 'no-backups', 'no-observers', 'activity-only', 'errors-only', 'no-analytics'])
// Explicitly retired source, not a generic missing-file escape hatch.
const retiredSources = new Set([
  'server/utils/backups/chain.ts', 'server/api/admin/backups/tables.get.ts',
  'server/middleware/access-logging.ts', 'server/plugins/access-log-store.ts',
  'server/utils/access-log-store.ts', 'server/utils/access-log-reader.ts', 'server/utils/access-log-migration.ts', 'server/utils/bounded-log-value.ts',
  'server/api/admin/logs/access.get.ts', 'server/api/admin/logs/access/[id].get.ts', 'server/api/admin/logs/access/export.get.ts', 'server/api/admin/logs/access/hourly.get.ts',
  'pages/admin/dashboard/logs/access.vue', 'pages/admin/logs/access.vue', 'utils/loggingAccessUi.ts', 'utils/loggingChart.ts', 'utils/loggingSettings.ts',
  ...['access-log-bounds', 'access-log-maintenance', 'access-log-migration-boot', 'access-log-migration', 'access-log-purge', 'access-log-reader', 'access-log-store-plugin', 'access-log-store', 'logging-access-ui', 'logging-chart', 'logging-excluded-paths-migration', 'logging-file-api', 'logging-file-ui'].map(name => `tests/unit/${name}.test.ts`)
])
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
  if (!args.includes('--fixture') || !profile || !profiles.has(profile) || !['build', 'dev'].includes(mode ?? '') || !binary || args.length !== 4 + Number(skipBrowser) + Number(Boolean(windowsNode)) + Number(Boolean(windowsModule)) || Boolean(windowsNode) !== Boolean(windowsModule) || (skipBrowser && windowsNode)) throw new Error('Use --fixture --profile=full|minimal|no-backups|no-observers|activity-only|errors-only|no-analytics --mode=build|dev --surreal-bin=/absolute/binary [--skip-browser | --browser-windows-node=/mnt/c/.../node.exe --browser-windows-module=C:/.../node_modules/playwright-core/index.mjs]')
  if (windowsNode && (process.platform !== 'linux' || !/^\/mnt\/[a-z]\/.*\/node\.exe$/.test(windowsNode) || !/^[A-Za-z]:[/\\].*[/\\]node_modules[/\\]playwright-core[/\\]index\.mjs$/.test(windowsModule!) || /[#?]/.test(windowsModule!))) throw new Error('Explicit Windows browser bridge paths are invalid')
  assertRuntime()
  const source = resolve('.'), storage = await createOwnedStorage()
  let db: Awaited<ReturnType<typeof startFixture>> | undefined
  let coldDb: Surreal | undefined
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
      'server/api/admin/backups/[id]/download.get.ts', 'server/api/admin/backups/[id]/download.head.ts',
      'server/utils/request-id.ts', 'server/middleware/request-id.ts', 'server/plugins/request-id.ts', 'scripts/backend-hardening/access-proxy.ts',
      'tests/unit/request-id.test.ts', 'tests/unit/access-log-retirement.test.ts', 'tests/unit/access-log-retirement-http.test.ts'])]
    if (files.length > 20_000) throw new Error('Source-copy file budget exceeded')
    for (const file of files) {
      if (interrupted) throw new Error('Owned fixture interrupted')
      if (/(^|\/)(?:\.env(?:\.|$)|storage\/|app-storage\/)/.test(file) || /^(?:\.git(?:\/|$)|public\/uploads\/|node_modules\/|\.nuxt\/|\.output\/|\.data\/|test-results\/)/.test(file) || file === 'pandablog.modules.json' || file.endsWith('.pem')) continue
      if (file.split('/').some(part => part === '..')) throw new Error('Unsafe source path')
      const from = join(source, file), to = join(storage.root, file)
      // Retired tracked files remain in the index until the patch is committed.
      if (retiredSources.has(file)) continue
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
    if (profile === 'activity-only') modules.logs = {enabled: true, activityLogs: true, errorLogs: false, accessLogs: true}
    if (profile === 'errors-only') modules.logs = {enabled: true, activityLogs: false, errorLogs: true, accessLogs: false}
    if (profile === 'no-analytics') modules.analytics = {enabled: false}
    await writeFile(storage.path('pandablog.modules.json'), JSON.stringify({version: 1, modules}))
    if (mode === 'dev') await writeFile(join(storage.root, 'server/api/ms-owned-probe.get.ts'), "export default defineEventHandler(() => ({generation: 1}));")
    await writeFile(join(storage.root, 'server/api/al-owned-error.get.ts'), "export default defineEventHandler(() => {throw createError({statusCode: 500, message: 'owned-request-correlation'})});")
    db = await startFixture({enabled: '1', binary})
    coldDb = new Surreal()
    await coldDb.connect(`${db.endpoint}/rpc`)
    await coldDb.signin({username: db.username, password: db.password})
    await coldDb.query(`DEFINE NAMESPACE ${db.namespace}; USE NS ${db.namespace}; DEFINE DATABASE ${db.database};`)
    await coldDb.use({namespace: db.namespace, database: db.database})
    await coldDb.query("DEFINE TABLE access_logs SCHEMALESS; CREATE access_logs:cold_history SET message = 'preserve cold source'; DEFINE TABLE app_settings SCHEMALESS; CREATE app_settings:cold_access CONTENT {key: '__access_logs_exported_v1', value: {dir: '/missing-old-mount', total: 17}}; CREATE app_settings:cold_logging CONTENT {key: 'logging', value: 'legacy-unparsed-settings'};")
    const coldQuery = 'SELECT * FROM access_logs; SELECT key, value FROM [app_settings:cold_access, app_settings:cold_logging] ORDER BY key;'
    const coldState = await coldDb.query(coldQuery)
    await mkdir(join(storage.root, 'storage/logs/access'), {recursive: true})
    const coldPath = join(storage.root, 'storage/logs/access/.migration-v1.json')
    await writeFile(coldPath, 'unfinished cold receipt')
    const verifyCold = async () => {
      if (JSON.stringify(await coldDb!.query(coldQuery)) !== JSON.stringify(coldState)
        || await readFile(coldPath, 'utf8') !== 'unfinished cold receipt') throw new Error('Actual app mutated retired access history during boot/restart')
    }
    const appPort = await port(), base = `http://127.0.0.1:${appPort}`, password = randomBytes(24).toString('hex'), session = randomBytes(32).toString('hex'), scoped = randomBytes(24).toString('hex')
    secrets.push(password, session, scoped, db.password)
    const env = {...fixtureEnvironment(), NODE_ENV: mode === 'build' ? 'production' : 'development', APP_VERSION: 'maintenance-fixture.dirty', HOST: '127.0.0.1', PORT: String(appPort), NITRO_HOST: '127.0.0.1', NITRO_PORT: String(appPort),
      NUXT_SURREAL_URL: `${db.endpoint.replace('http:', 'ws:')}/rpc`, NUXT_SURREAL_NAMESPACE: db.namespace, NUXT_SURREAL_DATABASE: db.database, NUXT_SURREAL_ROOT: db.username, NUXT_SURREAL_ROOT_PASSWORD: db.password,
      NUXT_SURREAL_APP_USER: 'owned_app', NUXT_SURREAL_APP_PASSWORD: scoped, NUXT_SESSION_PASSWORD: session, NUXT_APP_ORIGIN: base, NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY: 'false',
      // Loopback HTTP fixture only, not a change to shipped Secure cookies.
      NUXT_SESSION_COOKIE_SECURE: 'false'}
    const cli = join(source, 'node_modules/@nuxt/cli/bin/nuxi.mjs')
    // Explicit fixture compiler budget only. Windows full-profile Nitro tracing
    // exceeded Node's default ~4 GiB; this does not change deployed app limits.
    if (mode === 'build') for (const command of ['typecheck', 'build']) {
      const build = building = spawn(process.execPath, ['--max-old-space-size=8192', cli, command, '--dotenv=false'], {cwd: storage.root, env, stdio: ['ignore', 'pipe', 'pipe']})
      const timer = setTimeout(() => build.kill('SIGKILL'), command === 'build' ? 600_000 : 180_000)
      for (const pipe of [build.stdout!, build.stderr!]) pipe.on('data', bytes => {diagnostic = (diagnostic + String(bytes)).slice(-64 * 1024)})
      const code = await new Promise<number | null>((yes, no) => {build.once('error', no); build.once('close', yes)})
      clearTimeout(timer)
      building = undefined
      if (code !== 0) throw new Error(`Owned ${profile} ${command} failed (${code}); ${safe(diagnostic.slice(-8192))}`)
      console.info(JSON.stringify({evidence: 'owned-source-quality', profile, command, node: process.version, passed: true}))
    }
    if (mode === 'build') {
      // Verify emitted server code, not just source/mocked routes. Finite scan
      // over this fixture's owned output; no configured app artifacts inspected.
      const serverDir = join(storage.root, '.output/server')
      const emitted = await readdir(serverDir, {recursive: true})
      if (emitted.length > 20_000) throw new Error('Owned build inventory budget exceeded')
      let bytes = 0
      for (const file of emitted.filter(name => name.endsWith('.mjs'))) {
        const from = join(serverDir, file), info = await lstat(from)
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe emitted server artifact')
        bytes += info.size
        if (info.size > 64 * 1024 * 1024 || bytes > 256 * 1024 * 1024) throw new Error('Owned build scan byte budget exceeded')
        const code = await readFile(from, 'utf8')
        if (/appendAccessLog|queryAccessLogs|migrateAccessLogs|__PB_MODULE_LOGS_ACCESS__/.test(code)) throw new Error('Retired access engine remains in emitted server code')
      }
      console.info(JSON.stringify({evidence: 'owned-emitted-server-access-retirement', profile, files: emitted.length, bytes, passed: true}))
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
        let isReady = false
        try {isReady = (await get('/api/ready')).status === 200} catch { /* generated loopback only */ }
        if (isReady) {await verifyCold(); return} // preservation failures are not transient readiness errors
        await delay(100)
      }
      throw new Error(`Owned Nuxt readiness deadline: ${safe(diagnostic.slice(-8192))}`)
    }
    launch(); await ready()
    for (const route of ['/', '/login', '/api/health']) {
      const response = await get(route)
      if (response.status !== 200) throw new Error(`Owned route ${route} failed`)
      if (route === '/api/health' ? response.headers.has('x-request-id') : !response.headers.has('x-request-id')) throw new Error('Request-ID/health contract failed')
    }
    const ids = new Set<string | null>()
    for (let i = 0; i < 3; i++) ids.add((await get('/')).headers.get('x-request-id'))
    if (ids.has(null) || ids.size !== 3) throw new Error('Cached SSR response replayed request ID')
    if ((await get('/api/admin/logs/access')).status === 200) throw new Error('Retired access API is still active')
    const failed = await get('/api/al-owned-error')
    const failedId = failed.headers.get('x-request-id')
    if (failed.status !== 500 || !failedId) throw new Error('Actual app error lost request correlation')
    if (!['minimal', 'no-observers', 'activity-only'].includes(profile)) {
      let correlated = false
      for (let attempt = 0; attempt < 50; attempt++) {
        const rows = (await coldDb!.query('SELECT request_id FROM error_logs WHERE request_id = $id;', {id: failedId}))[0] as unknown[]
        if (rows.length === 1) {correlated = true; break}
        await delay(20)
      }
      if (!correlated) throw new Error('Actual Nitro hook/error DB row did not match response request ID')
    }
    if (await lstat(join(storage.root, 'storage/backups/.writer.lock')).then(() => true, () => false)) throw new Error('Application created writer receipt')
    const setup = await fetch(`${base}/api/auth/setup`, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: base}, body: JSON.stringify({password, confirm_password: password}), signal: AbortSignal.timeout(20_000)})
    if (setup.status !== 200) throw new Error(`Owned setup refused: ${setup.status}`)
    if (!skipBrowser) {
      const labels: BrowserFixtureInput['labels'] = {}
      for (const locale of ['en', 'zh-CN']) {
        const value = JSON.parse(await readFile(join(storage.root, `i18n/locales/${locale}.json`), 'utf8'))
        labels[locale] = {dashboard: value.admin.nav.dashboard, hold: value.admin.backups.jobsQuiescing.split('{until}')[0], createBackup: value.admin.backups.createBackup, importBackup: value.admin.backups.importBackup, settings: value.admin.backups.settings, noBackups: value.admin.backups.noBackups, loadFailed: value.admin.backups.loadFailed, logsTitle: value.admin.logs.title, logsSettings: value.admin.logs.settings.title, logStorage: value.admin.logs.storage}
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
    await verifyCold()
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
    console.info(JSON.stringify({evidence: 'owned-full-Nuxt-DB-browser-not-deployment', profile, mode, node: process.version, routes: skipBrowser ? 'public/login/health HTTP; browser explicitly skipped' : 'public/login/admin/status en/zh-CN', browser: !skipBrowser, ordinaryCrash: mode === 'build', watcherReload: mode === 'dev', destructiveFence: true, accessHistoryUntouched: true, requestIds: true, fixtureHttpSessionCookieSecure: false}))
  } finally {
    process.removeListener('SIGTERM', interrupt); process.removeListener('SIGINT', interrupt)
    await stopApp(); await coldDb?.close(); await db?.stop(); await storage.cleanup()
  }
}
main().catch(error => {console.error(error instanceof Error ? error.message : 'Owned app fixture failed'); process.exitCode = 1})
