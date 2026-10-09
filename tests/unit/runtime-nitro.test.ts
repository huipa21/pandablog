import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createNitro, build, type NitroConfig } from 'nitropack'
import { describe, expect, it } from 'vitest'
import { JobStore } from '../../server/utils/backups/jobMutex'
import { createOwnedStorage, fixtureEnvironment, type OwnedStorage } from '../../scripts/backend-hardening/fixture'

async function port() {
  const server = createServer()
  await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes))
  const value = (server.address() as {port: number}).port
  await new Promise<void>(yes => server.close(() => yes()))
  return value
}
async function exists(path: string) {return stat(path).then(() => true, () => false)}
async function launch(entry: string, storage: OwnedStorage, overrides: Record<string, string | undefined> = {}) {
  await storage.verify()
  const listenPort = await port()
  const child: ChildProcess = spawn(process.execPath, [entry], {cwd: storage.root, env: {
    ...fixtureEnvironment(), NODE_ENV: 'production', PORT: String(listenPort), HOST: '127.0.0.1',
    NUXT_SURREAL_URL: 'ws://127.0.0.1:1/rpc', NUXT_SURREAL_NAMESPACE: 'owned_fixture', NUXT_SURREAL_DATABASE: 'owned_fixture',
    NUXT_SURREAL_ROOT: 'fixture_root', NUXT_SURREAL_ROOT_PASSWORD: 'synthetic-root-sentinel',
    NUXT_SURREAL_APP_USER: 'fixture_app', NUXT_SURREAL_APP_PASSWORD: 'synthetic-app-sentinel',
    NUXT_SESSION_PASSWORD: 'synthetic-session-sentinel-32-characters', NUXT_APP_ORIGIN: 'http://127.0.0.1:3000', ...overrides
  }, stdio: ['ignore', 'pipe', 'pipe', 'ipc']})
  let diagnostics = ''
  child.stdout!.on('data', bytes => {diagnostics = (diagnostics + bytes.toString()).slice(-8192)})
  child.stderr!.on('data', bytes => {diagnostics = (diagnostics + bytes.toString()).slice(-8192)})
  const exited = new Promise<void>(yes => child.once('close', () => yes()))
  const url = `http://127.0.0.1:${listenPort}`
  const get = (path: string) => fetch(`${url}${path}`, {signal: AbortSignal.timeout(1000)})
  try {
    const deadline = Date.now() + 15_000
    let listening = false
    while (Date.now() < deadline && child.exitCode === null) {
      try {if ((await get('/api/health')).status === 200) {listening = true; break}} catch { /* owned port only */ }
      await delay(20)
    }
    if (!listening) throw new Error('Owned Nitro fixture did not listen')
  } catch (error) {child.kill(); await exited; throw error}
  return {
    child, get, diagnostics: () => diagnostics,
    async stop(force = false) {
      if (child.exitCode !== null || child.signalCode !== null) {await exited; return}
      if (force) child.kill('SIGKILL')
      else child.send('fixture-close')
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([exited, new Promise<never>((_, no) => {timer = setTimeout(() => {child.kill('SIGKILL'); no(new Error('Owned Nitro close deadline exceeded'))}, 10_000)})])
      } finally {clearTimeout(timer)}
    }
  }
}

async function launchDevWorkers(entry: string, storage: OwnedStorage, output: OwnedStorage) {
  await writeFile(output.path('dev-driver.mjs'), `import {Worker} from 'node:worker_threads';
const workers = new Set(); let current;
function start() {
  const worker = new Worker(process.argv[2], {env: {...process.env, NITRO_NO_UNIX_SOCKET:'1'}});
  workers.add(worker); current=worker;
  worker.on('message', msg => {if(msg.event === 'listen') process.send({port: msg.address.port}); if(msg.event === 'exit') void worker.terminate().then(() => {workers.delete(worker); if(!workers.size) process.exit(0)})});
  worker.on('error', () => process.exit(1));
}
process.on('message', msg => {if(msg === 'reload') {current.postMessage({event:'shutdown'}); start()} if(msg === 'force') void current.terminate().then(() => {workers.delete(current); start()}); if(msg === 'stop') for(const worker of workers) worker.postMessage({event:'shutdown'})});
start();`)
  const child = spawn(process.execPath, [output.path('dev-driver.mjs'), entry], {cwd: storage.root, env: {
    ...fixtureEnvironment(), NODE_ENV: 'development', NUXT_SURREAL_URL: 'ws://127.0.0.1:1/rpc', NUXT_SURREAL_NAMESPACE: 'fixture', NUXT_SURREAL_DATABASE: 'fixture',
    NUXT_SURREAL_ROOT: 'fixture_root', NUXT_SURREAL_ROOT_PASSWORD: 'synthetic-root', NUXT_SURREAL_APP_USER: 'fixture_app', NUXT_SURREAL_APP_PASSWORD: 'synthetic-app',
    NUXT_SESSION_PASSWORD: 'synthetic-session-32-plus-characters', NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY: 'false'
  }, stdio: ['ignore', 'pipe', 'pipe', 'ipc']})
  const ports: number[] = []
  child.on('message', message => {ports.push((message as {port: number}).port)})
  let diagnostics = ''
  for (const pipe of [child.stdout!, child.stderr!]) pipe.on('data', bytes => {diagnostics = (diagnostics + bytes.toString()).slice(-8192)})
  const exited = new Promise<void>(yes => child.once('close', () => yes()))
  return {
    reload: () => child.send('reload'), force: () => child.send('force'), diagnostics: () => diagnostics,
    async listening() {
      const deadline = Date.now() + 10_000
      while (!ports.length && Date.now() < deadline && child.exitCode === null) await delay(20)
      if (!ports.length) throw new Error('Owned dev worker did not listen')
      return `http://127.0.0.1:${ports.shift()}`
    },
    async stop() {
      child.send('stop')
      let timer: ReturnType<typeof setTimeout> | undefined
      try {await Promise.race([exited, new Promise<never>((_, no) => {timer = setTimeout(() => {child.kill(); no(new Error('Owned dev worker close deadline exceeded'))}, 10_000)})])}
      finally {clearTimeout(timer)}
    }
  }
}

describe('actual installed production Nitro non-awaiting lifecycle (owned FS; no configured DB)', () => {
  it('fences cached/local/auth routes, handles contention/failure, clean restart and runtime public overrides', async () => {
    const output = await createOwnedStorage(), storage = await createOwnedStorage(), devStorage = await createOwnedStorage()
    const source = resolve('.')
    let nitro: Awaited<ReturnType<typeof createNitro>> | undefined, devNitro: typeof nitro
    const children: Awaited<ReturnType<typeof launch>>[] = []
    try {
      const startupModule = JSON.stringify(join(source, 'server/utils/startup').replaceAll('\\', '/'))
      const databaseModule = JSON.stringify(join(source, 'server/utils/db').replaceAll('\\', '/'))
      await writeFile(output.path('initialize.ts'), `import {writeFile, readFile} from 'node:fs/promises'; import {startup} from ${startupModule}; import {connectRootClient} from ${databaseModule};
export default defineNitroPlugin(nitro => {
  process.on('message', message => {if(message === 'fixture-close') void nitro.hooks.callHook('close').then(() => process.exit(0))});
  void startup.initialize(async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if(process.env.PB_BOOT_PRE_MUTATION_FAIL) await connectRootClient();
    const count = Number(await readFile('boot-count', 'utf8').catch(() => '0'));
    await writeFile('boot-count', String(count+1));
    if(process.env.PB_BOOT_FAIL) throw new Error('synthetic-app-sentinel SQL cause');
  });
});`)
      await writeFile(output.path('handler.ts'), `export default defineEventHandler(async event => {
  if(event.path === '/hold') {await import('node:fs/promises').then(fs => fs.writeFile('holding', 'owned')); await new Promise(resolve => setTimeout(resolve, 1000)); return {settled: true}}
  if(event.path === '/local') return event.$fetch('/api/auth/setup');
  const config = useRuntimeConfig(event);
  return {ordinary: true, footer: config.public.footerShowPoweredBy, canonicalEndpoint: config.surrealUrl === process.env.NUXT_SURREAL_URL, canonicalOrigin: config.appOrigin === process.env.NUXT_APP_ORIGIN};
});`)
      await writeFile(output.path('health.ts'), 'export default defineEventHandler(() => ({ok:true}));')
      const config: NitroConfig = {
        rootDir: output.root, srcDir: output.root, scanDirs: [], preset: 'node-server', compatibilityDate: '2026-05-17',
        buildDir: output.path('build'), output: {dir: output.path('output'), serverDir: join(output.root, 'output/server'), publicDir: join(output.root, 'output/public')},
        nodeModulesDirs: [resolve('node_modules')],
        plugins: [join(source, 'server/plugins/00-maintenance.ts'), output.path('initialize.ts')].map(path => path.replaceAll('\\', '/')),
        handlers: [
          {route: '/api/health', handler: output.path('health.ts')},
          {route: '/api/ready', handler: join(source, 'server/api/ready.get.ts')},
          {middleware: true, handler: join(source, 'server/middleware/00-runtime-config.ts')},
          {middleware: true, handler: join(source, 'server/middleware/restore-maintenance.ts')},
          {route: '/**', handler: output.path('handler.ts')}
        ].map(handler => ({...handler, handler: handler.handler.replaceAll('\\', '/')})),
        routeRules: {'/': {cache: {maxAge: 60}}},
        runtimeConfig: {surrealUrl: '', surrealNamespace: '', surrealDatabase: '', surrealRoot: '', surrealRootPassword: '', surrealAppUser: '', surrealAppPassword: '', appOrigin: '', session: {password: ''}, public: {footerShowPoweredBy: false}, nitro: {envPrefix: 'NUXT_'}}
      }
      nitro = await createNitro(config)
      await build(nitro)
      const entry = join(output.root, 'output/server/index.mjs')
      const lock = join(storage.root, 'storage/backups/.writer.lock')
      const first = await launch(entry, storage, {NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY: 'off', NUXT_PUBLIC_APP_SPONSOR: 'true'})
      children.push(first)
      for (const path of ['/', '/api/auth/setup', '/api/auth/login', '/local', '/api/posts']) expect((await first.get(path)).status).toBe(503)
      await expect.poll(async () => (await first.get('/api/ready')).status, {timeout: 5000}).toBe(200)
      expect(await (await first.get('/')).json()).toMatchObject({ordinary: true, footer: false, canonicalEndpoint: true, canonicalOrigin: true})
      expect((await first.get('/local')).status).toBe(200)
      expect(await exists(lock)).toBe(false)
      await first.stop(true) // ordinary ready-process crash; no writer cleanup
      expect(await exists(lock)).toBe(false)
      const second = await launch(entry, storage, {NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY: 'yes', NUXT_PUBLIC_APP_SPONSOR: 'false'})
      children.push(second)
      await expect.poll(async () => (await second.get('/api/ready')).status, {timeout: 5000}).toBe(200)
      expect(await (await second.get('/')).json()).toMatchObject({footer: true})
      expect(await readFile(join(storage.root, 'boot-count'), 'utf8')).toBe('2')
      await second.stop()
      const removedAlias = await launch(entry, storage, {NUXT_PUBLIC_APP_SPONSOR: 'yes', APP_SPONSOR: 'true', NUXT_SURREAL_ROOT: '', NUXT_SURREAL_ROOT_PASSWORD: ''})
      children.push(removedAlias)
      await expect.poll(async () => (await removedAlias.get('/api/ready')).status, {timeout: 5000}).toBe(200)
      expect(await (await removedAlias.get('/')).json()).toMatchObject({footer: false})
      await removedAlias.stop()
      for (const overrides of [{NUXT_SURREAL_APP_USER: '', SURREAL_APP_USER: 'removed_user'}, {NUXT_PUBLIC_FOOTER_SHOW_POWERED_BY: '', NUXT_PUBLIC_APP_SPONSOR: 'true'}]) {
        const invalid = await launch(entry, storage, overrides)
        children.push(invalid)
        expect((await invalid.get('/api/ready')).status).toBe(503)
        expect((await invalid.get('/')).status).toBe(503)
        await invalid.stop()
        expect(await exists(lock)).toBe(false)
        expect(await readFile(join(storage.root, 'boot-count'), 'utf8')).toBe('3')
      }
      const preMutation = await launch(entry, storage, {PB_BOOT_PRE_MUTATION_FAIL: '1', NUXT_SURREAL_URL: 'http://127.0.0.1:1/rpc'})
      children.push(preMutation)
      // An unreachable DB is an outage, not a recovery case: the live process keeps
      // its writer, retries automatically and tells clients to wait.
      await expect.poll(async () => (await (await preMutation.get('/api/ready')).json()).guidance?.action, {timeout: 5000}).toBe('wait')
      expect((await (await preMutation.get('/api/ready')).json()).guidance?.recoveryRequired).toBe(false)
      expect(await exists(lock)).toBe(false)
      expect(await exists(join(storage.root, 'storage/backups/.uncertain-writes.json'))).toBe(false)
      expect(await readFile(join(storage.root, 'boot-count'), 'utf8')).toBe('3')
      await preMutation.stop(true) // forced death during actual initialization retry
      expect(await exists(lock)).toBe(false) // clean shutdown during an outage needs no recovery
      const failing = await launch(entry, storage, {PB_BOOT_FAIL: '1'})
      children.push(failing)
      await expect.poll(async () => (await (await failing.get('/api/ready')).json()).state, {timeout: 5000}).toBe('failed')
      expect(await exists(join(storage.root, 'storage/backups/.uncertain-writes.json'))).toBe(false)
      expect((await failing.get('/api/ready')).status).toBe(503)
      expect((await failing.get('/')).status).toBe(503)
      await failing.stop()
      expect(await exists(lock)).toBe(false)
      const recovering = await launch(entry, storage)
      children.push(recovering)
      // Corrected required boot retries on the next process without receipts.
      await expect.poll(async () => (await recovering.get('/api/ready')).status, {timeout: 5000}).toBe(200)
      expect(await (await recovering.get('/api/ready')).json()).toMatchObject({state: 'ready', ready: true})
      expect(await readFile(join(storage.root, 'boot-count'), 'utf8')).toBe('5')
      await recovering.stop()
      await mkdir(lock, {recursive: true})
      await writeFile(join(lock, 'owner.json'), 'retired corrupt owner from different container')
      const legacy = await launch(entry, storage)
      children.push(legacy)
      await expect.poll(async () => (await legacy.get('/api/ready')).status, {timeout: 5000}).toBe(200)
      await legacy.stop()
      expect(await readFile(join(lock, 'owner.json'), 'utf8')).toBe('retired corrupt owner from different container')
      const restoreStore = new JobStore(join(storage.root, 'storage/backups'))
      const restoreOwner = await restoreStore.acquire({id: 'interrupted', kind: 'restore', startedAt: new Date().toISOString()})
      await restoreStore.beginRestore(restoreOwner)
      await restoreStore.transition(restoreOwner, {phase: 'db-wipe', destructive: true})
      const interrupted = await launch(entry, storage)
      children.push(interrupted)
      await expect.poll(async () => (await (await interrupted.get('/api/ready')).json()).state, {timeout: 5000}).toBe('recovery-required')
      expect((await (await interrupted.get('/api/ready')).json()).guidance.recoveryRequired).toBe(true)
      expect(await readFile(join(storage.root, 'boot-count'), 'utf8')).toBe('6')
      await interrupted.stop()
      for (const child of children) {
        expect(child.diagnostics()).not.toMatch(/unhandledrejection|synthetic-app-sentinel|synthetic-root-sentinel|synthetic-session-sentinel/i)
      }

      // Real installed nitro-dev entry and worker shutdown messages. Like the
      // installed DevServer.reload(), start the replacement without awaiting
      // old close. Both workers have the same process PID, different tokens.
      devNitro = await createNitro({...config, preset: 'node-server', entry: resolve('node_modules/nitropack/dist/presets/_nitro/runtime/nitro-dev.mjs'),
        // Use the installed dev entry with one-shot compilation, rather than
        // leaving a Rollup watch process open in Vitest. Match its runtime mode.
        replace: {'process.env.NODE_ENV': '"development"'},
        buildDir: output.path('dev-build'), output: {dir: output.path('dev-output'), serverDir: join(output.root, 'dev-output/server'), publicDir: join(output.root, 'dev-output/public')}})
      await build(devNitro)
      const dev = await launchDevWorkers(join(output.root, 'dev-output/server/index.mjs'), devStorage, output)
      try {
        const firstURL = await dev.listening()
        await expect.poll(async () => (await fetch(`${firstURL}/api/ready`)).status, {timeout: 5000}).toBe(200)
        const held = fetch(`${firstURL}/hold`).catch(() => undefined)
        await expect.poll(() => exists(join(devStorage.root, 'holding')), {timeout: 5000}).toBe(true)
        dev.reload()
        const secondURL = await dev.listening()
        await expect.poll(async () => (await fetch(`${secondURL}/api/ready`)).status, {timeout: 7000}).toBe(200)
        await held
        expect(await readFile(join(devStorage.root, 'boot-count'), 'utf8')).toBe('2')
        dev.force()
        const thirdURL = await dev.listening()
        await expect.poll(async () => (await fetch(`${thirdURL}/api/ready`)).status, {timeout: 7000}).toBe(200)
        expect(await readFile(join(devStorage.root, 'boot-count'), 'utf8')).toBe('3')
        expect(dev.diagnostics()).not.toMatch(/unhandledrejection|initialization failed|configuration or writer ownership failed/i)
      } finally {await dev.stop()}
      expect(await exists(join(devStorage.root, 'storage/backups/.writer.lock'))).toBe(false)
    } finally {
      await Promise.all(children.map(child => child.stop(true)))
      await nitro?.close(); await devNitro?.close()
      await storage.cleanup(); await devStorage.cleanup(); await output.cleanup()
    }
  }, 120_000)
})
