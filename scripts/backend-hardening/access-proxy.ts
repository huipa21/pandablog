/** Explicitly opted-in, disposable Linux proxy containers only. No app data/env. */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { setTimeout as delay } from 'node:timers/promises'
import { assertRuntime, createOwnedStorage, fixtureEnvironment } from './fixture'

const exec = promisify(execFile)
async function port() {
  const socket = createServer()
  await new Promise<void>(yes => socket.listen(0, '127.0.0.1', yes))
  const value = (socket.address() as {port: number}).port
  await new Promise<void>(yes => socket.close(() => yes()))
  return value
}
async function main() {
  if (process.argv.slice(2).join(' ') !== '--fixture --engine=podman') throw new Error('Use --fixture --engine=podman; no external endpoints or container names accepted')
  assertRuntime()
  const storage = await createOwnedStorage(), token = randomBytes(12).toString('hex'), prefix = `pb-access-${token}`
  const network = `${prefix}-net`, volume = `${prefix}-logs`, upstream = `${prefix}-upstream`
  const containers: string[] = [], env = fixtureEnvironment()
  // Container CLI's local connection profile only; never inherit app credentials.
  for (const key of ['USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'HOME', 'XDG_RUNTIME_DIR']) if (process.env[key]) env[key] = process.env[key]
  const cli = async (...args: string[]) => (await exec('podman', args, {env, timeout: 120_000, maxBuffer: 1024 * 1024})).stdout.trim()
  let networkCreated = false, volumeCreated = false
  const label = ['--label', `pb.access-fixture=${token}`]
  async function create(name: string, args: string[]) {
    containers.push(name)
    await cli('create', '--name', name, ...label, '--network', network, ...args)
  }
  async function waitReady(base: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {if ((await fetch(base, {signal: AbortSignal.timeout(1000)})).ok) return} catch { /* own loopback */ }
      await delay(100)
    }
    throw new Error('Owned proxy did not listen')
  }
  async function request(base: string, path: string) {
    return fetch(base + path, {headers: {Authorization: 'Bearer auth-sentinel', Cookie: 'cookie-sentinel=secret', Referer: 'https://invalid.example/referrer-sentinel', 'X-Request-Id': 'spoofed-input', 'User-Agent': 'ua-sentinel', Connection: 'close'}, signal: AbortSignal.timeout(20_000)})
  }
  async function cleanup() {
    // Never enumerate/remove existing containers: exact generated names + label check.
    for (const name of containers.reverse()) {
      const owned = await cli('inspect', '--format', '{{index .Config.Labels "pb.access-fixture"}}', name).catch(() => '')
      if (owned === token) await cli('rm', '-f', name)
      else if (owned) throw new Error('Container ownership mismatch; artifacts preserved')
    }
    if (volumeCreated) await cli('volume', 'rm', volume)
    if (networkCreated) await cli('network', 'rm', network)
    await storage.cleanup()
  }
  try {
    await cli('network', 'create', ...label, network); networkCreated = true
    await cli('volume', 'create', ...label, volume); volumeCreated = true
    // Synthetic upstream lives exclusively inside the owned private network.
    await create(upstream, ['docker.io/library/node:22-alpine', 'node', '-e', `const {createServer}=require('node:http'),{randomUUID}=require('node:crypto');createServer((req,res)=>{res.setHeader('X-Request-Id',randomUUID());res.setHeader('Set-Cookie','response-cookie-sentinel=secret');res.statusCode=req.url.startsWith('/failure')?500:200;res.end('body-sentinel');}).listen(3000);`])
    await cli('start', upstream)
    const caddySource = await readFile(resolve('deploy/production/caddy/Caddyfile'), 'utf8')
    const snippet = caddySource.slice(caddySource.indexOf('(logs) {'), caddySource.indexOf('# Baseline response headers.'))
      .replaceAll('/var/log/caddy/', '/logs/').replace('10MiB', '1MiB')
    await writeFile(storage.path('Caddyfile'), `{\n auto_https off\n admin off\n}\n${snippet}\n:8080 {\n import logs caddy\n handle /edge-denial {\n respond "denied" 403\n }\n handle {\n reverse_proxy ${upstream}:3000\n }\n}\n`)
    const format = await readFile(resolve('deploy/production/nginx/access-log-format.conf'), 'utf8')
    await writeFile(storage.path('nginx.conf'), `events {}\nhttp {\n${format}\nserver {listen 8080; access_log /logs/nginx.log pandablog_json; location = /edge-denial { return 403; } location / { proxy_pass http://${upstream}:3000; proxy_connect_timeout 2s; proxy_set_header X-Forwarded-For $remote_addr; }}}`)
    const targets: Array<{name: string, base: string, kind: string, version: string, unavailableStatus?: number, expected: Map<string, number>}> = []
    for (const kind of ['caddy', 'nginx']) {
      console.info(`Owned proxy: validating ${kind}`)
      const name = `${prefix}-${kind}`, listen = await port()
      await create(name, ['-p', `127.0.0.1:${listen}:8080`, '-v', `${volume}:/logs`, '-e', 'TZ=UTC', kind === 'caddy' ? 'docker.io/library/caddy:2.10.2' : 'docker.io/library/nginx:1.28.0'])
      await cli('cp', storage.path(kind === 'caddy' ? 'Caddyfile' : 'nginx.conf'), `${name}:${kind === 'caddy' ? '/etc/caddy/Caddyfile' : '/etc/nginx/nginx.conf'}`)
      await cli('start', name)
      const base = `http://127.0.0.1:${listen}`, expected = new Map<string, number>()
      await waitReady(base)
      await cli('exec', name, kind, kind === 'caddy' ? 'validate' : '-t', ...(kind === 'caddy' ? ['--config', '/etc/caddy/Caddyfile'] : []))
      for (const [path, status] of [['/normal?query-sentinel=secret', 200], ['/failure?query-sentinel=secret', 500], ['/edge-denial', 403]] as const) {
        const response = await request(base, path)
        if (response.status !== status) throw new Error(`Owned ${kind} status mismatch`)
        const id = response.headers.get('x-request-id')
        if (status !== 403) {
          if (!id || id === 'spoofed-input') throw new Error('Upstream response correlation absent/spoofed')
          expected.set(id, status)
        }
        await response.text()
      }
      // Stop/start same owned container: logs must append on its persistent volume.
      await cli('stop', name); await cli('start', name); await waitReady(base)
      const restarted = await request(base, '/after-restart?query-sentinel=secret'); await restarted.text()
      expected.set(restarted.headers.get('x-request-id')!, 200)
      const version = await exec('podman', ['exec', name, kind, kind === 'caddy' ? 'version' : '-v'], {env, timeout: 10_000, maxBuffer: 4096})
      targets.push({name, base, kind, version: (version.stdout + version.stderr).trim(), expected})
    }
    // Force real Caddy rotation with a bounded ~1.6 MiB of access entries.
    const caddy = targets[0]!, nginx = targets[1]!
    console.info('Owned proxy: Caddy rotation and nginx reopen')
    for (let i = 0; i < 400; i++) await (await request(caddy.base, `/rotation/${'a'.repeat(3800)}?query-sentinel=secret`)).text()
    // nginx rotation belongs to the host; exercise explicit reopen on owned files.
    await cli('exec', nginx.name, 'mv', '/logs/nginx.log', '/logs/nginx.log.1')
    await cli('exec', nginx.name, 'nginx', '-s', 'reopen'); await delay(200)
    const reopened = await request(nginx.base, '/after-reopen?query-sentinel=secret'); await reopened.text()
    nginx.expected.set(reopened.headers.get('x-request-id')!, 200)
    console.info('Owned proxy: unavailable upstream coverage')
    await cli('stop', upstream)
    for (const target of targets) {
      const unavailable = await request(target.base, '/unreachable?query-sentinel=secret')
      if (![502, 504].includes(unavailable.status) || unavailable.headers.has('x-request-id')) throw new Error(`Unavailable upstream response violated edge-only contract (${target.kind}, ${unavailable.status})`)
      target.unavailableStatus = unavailable.status
      await unavailable.text(); await cli('stop', target.name)
    }
    // Read the persisted volume through an owned, read-only running mount.
    // Remote Podman does not reliably expose stopped-container volume mounts.
    const reader = `${prefix}-reader`
    await create(reader, ['-v', `${volume}:/logs:ro`, 'docker.io/library/node:22-alpine', 'node', '-e', 'setInterval(()=>{},10000)'])
    await cli('start', reader)
    await cli('cp', `${reader}:/logs/.`, storage.root)
    const files = await readdir(storage.root)
    const caddyFiles = files.filter(name => name.startsWith('caddy') && /\.log(?:\.gz)?$/.test(name))
    if (caddyFiles.length < 2) throw new Error('Caddy did not rotate real access output')
    if (!files.includes('nginx.log.1') || !files.includes('nginx.log')) throw new Error('nginx reopen did not preserve old and new output')
    for (const target of targets) {
      const selected = files.filter(name => name.startsWith(target.kind) && /\.log(?:\.gz|\.1)?$/.test(name))
      const rows: Array<Record<string, any>> = []
      for (const name of selected) {
        const file = join(storage.root, name)
        if ((await stat(file)).size > 8 * 1024 * 1024) throw new Error('Proxy fixture log byte budget exceeded')
        const bytes = await readFile(file)
        const text = (name.endsWith('.gz') ? gunzipSync(bytes, {maxOutputLength: 8 * 1024 * 1024}) : bytes).toString('utf8')
        if (/query-sentinel|auth-sentinel|cookie-sentinel|referrer-sentinel|ua-sentinel|body-sentinel|spoofed-input/.test(text)) throw new Error(`${target.kind} leaked a sensitive sentinel`)
        for (const line of text.trim().split('\n').filter(Boolean)) rows.push(JSON.parse(line))
      }
      for (const [id, status] of target.expected) if (!rows.some(row => row.app_request_id === id && row.status === status)) throw new Error(`${target.kind} lost app response correlation/history`)
      for (const status of [403, target.unavailableStatus!]) if (!rows.some(row => row.status === status && (!row.app_request_id || row.app_request_id === '-'))) throw new Error(`${target.kind} missing edge-only coverage`)
      console.info(JSON.stringify({evidence: 'owned-Linux-proxy-synthetic-upstream-not-deployed-edge-or-Nitro', kind: target.kind, version: target.version, privacy: true, correlation: true, persistence: true, rotationOrReopen: true}))
    }
  } finally { await cleanup() }
}
main().catch(error => {console.error(error instanceof Error ? error.message : 'Owned proxy fixture failed'); process.exitCode = 1})
