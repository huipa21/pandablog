#!/usr/bin/env node
/**
 * `panda` — PandaBlog container CLI.
 *
 * A dependency-free operator tool that ships inside the runtime image. It is
 * deliberately thin: it reports build identity and probes the running server
 * over loopback HTTP. It does NOT reach into the Nitro bundle or the database,
 * because the runtime image contains only a compiled server and importing its
 * internals would break on every Nitro upgrade. Anything needing real data
 * should go through the authenticated /api/admin/* routes instead.
 *
 * Commands:
 *   panda version [--json]   Print the build version
 *   panda info [--json]      Build identity + runtime environment
 *   panda health [--json]    Probe the local server; exit 0 healthy, 1 unhealthy
 *   panda help               Show usage
 */

import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '..')
const VERSION_FILE = resolve(APP_ROOT, 'version.json')

const STORAGE_DIRS = [
  'uploads',
  'variants',
  'downloads',
  'backups',
  'geoip',
  'logs',
  'rate-limit'
]

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function fail(message) {
  process.stderr.write(`\npanda: ${message}\n\n`)
  process.exit(1)
}

function out(text) {
  process.stdout.write(`${text}\n`)
}

function json(value) {
  out(JSON.stringify(value, null, 2))
}

function wantsJson(args) {
  return args.includes('--json')
}

function flagValue(args, name) {
  const index = args.indexOf(name)
  return index !== -1 ? args[index + 1] : undefined
}

/* ------------------------------------------------------------------ */
/* build identity                                                      */
/* ------------------------------------------------------------------ */

/**
 * Resolve build metadata.
 *
 * In the container this comes from version.json, written at image build time
 * (git is absent from the runtime image). In a dev checkout we shell out to
 * scripts/version.mjs so the CLI and the build agree byte-for-byte. If neither
 * path works we fail loudly rather than reporting a fictional version.
 */
function loadBuildInfo() {
  if (existsSync(VERSION_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(VERSION_FILE, 'utf8'))
      if (parsed?.version) return { ...parsed, source: 'version.json' }
      fail(`version.json exists but has no "version" field: ${VERSION_FILE}`)
    } catch (error) {
      fail(`version.json is present but unreadable: ${error.message}`)
    }
  }

  const generator = resolve(APP_ROOT, 'scripts', 'version.mjs')
  if (existsSync(generator)) {
    try {
      const raw = execFileSync(process.execPath, [generator, '--json'], {
        cwd: APP_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
      return { ...JSON.parse(raw), source: 'git' }
    } catch (error) {
      const detail = String(error.stderr || error.message).trim()
      fail(`could not determine the build version from git.\n  ${detail.split('\n').join('\n  ')}`)
    }
  }

  if (process.env.PANDABLOG_VERSION) {
    return { version: process.env.PANDABLOG_VERSION, source: 'env:PANDABLOG_VERSION' }
  }

  fail(
    'no build version available.\n'
    + '  Expected version.json at the app root, a git checkout with\n'
    + '  scripts/version.mjs, or PANDABLOG_VERSION in the environment.'
  )
}

function storageState(name) {
  const target = resolve(APP_ROOT, 'storage', name)
  if (!existsSync(target)) return 'missing'
  try {
    accessSync(target, constants.W_OK)
    return 'writable'
  } catch {
    return 'read-only'
  }
}

/* ------------------------------------------------------------------ */
/* commands                                                            */
/* ------------------------------------------------------------------ */

function cmdVersion(args) {
  const build = loadBuildInfo()
  if (wantsJson(args)) {
    json(build)
    return
  }
  out(build.version)
}

function cmdInfo(args) {
  const build = loadBuildInfo()
  const host = process.env.NITRO_HOST || '127.0.0.1'
  const port = process.env.NITRO_PORT || process.env.PORT || '3000'

  const info = {
    version: build.version,
    commit: build.sha ?? null,
    commitDate: build.committedAt ?? null,
    dirty: build.dirty ?? false,
    versionSource: build.source,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    nodeEnv: process.env.NODE_ENV ?? 'development',
    listen: `${host}:${port}`,
    appRoot: APP_ROOT,
    storage: Object.fromEntries(STORAGE_DIRS.map((dir) => [dir, storageState(dir)]))
  }

  if (wantsJson(args)) {
    json(info)
    return
  }

  const rows = [
    ['Version', info.version + (info.dirty ? '  (built from a dirty tree)' : '')],
    ['Commit', info.commit ? `${info.commit.slice(0, 7)}  ${info.commitDate ?? ''}`.trim() : 'n/a'],
    ['Source', info.versionSource],
    ['Node', `${info.node}  ${info.platform}`],
    ['NODE_ENV', info.nodeEnv],
    ['Listen', info.listen],
    ['App root', info.appRoot]
  ]
  const width = Math.max(...rows.map(([label]) => label.length))

  out('')
  for (const [label, value] of rows) out(`  ${label.padEnd(width)}   ${value}`)
  out(`\n  Storage  ${resolve(APP_ROOT, 'storage')}`)
  for (const dir of STORAGE_DIRS) {
    const state = info.storage[dir]
    const mark = state === 'writable' ? '+' : state === 'read-only' ? '!' : 'x'
    out(`    ${mark} ${dir.padEnd(12)} ${state}`)
  }
  out('')
}

function cmdHealth(args) {
  const url = flagValue(args, '--url')
    || `http://127.0.0.1:${process.env.NITRO_PORT || process.env.PORT || '3000'}/`
  const timeoutSeconds = Number(flagValue(args, '--timeout') ?? 5)
  const timeout = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 5000
  const started = Date.now()

  const finish = (ok, detail, status) => {
    const latencyMs = Date.now() - started
    if (wantsJson(args)) {
      json({ ok, url, status: status ?? null, latencyMs, detail })
    } else {
      out(ok ? `ok    ${url}  ${detail}  ${latencyMs}ms` : `FAIL  ${url}  ${detail}`)
    }
    process.exit(ok ? 0 : 1)
  }

  const request = http.get(url, (response) => {
    response.resume()
    const status = response.statusCode ?? 0
    // Any non-5xx response means the process is up and routing requests.
    // Redirects and auth challenges are healthy; only server faults are not.
    finish(status > 0 && status < 500, `http ${status}`, status)
  })

  request.setTimeout(timeout, () => {
    request.destroy()
    finish(false, `timeout after ${timeout}ms`)
  })

  request.on('error', (error) => finish(false, error.message))
}

function cmdHelp() {
  out(`
  panda — PandaBlog container CLI

  Usage
    panda <command> [options]

  Commands
    version            Print the build version (YYMMDD-N+g<sha>)
    info               Build identity and runtime environment
    health             Probe the local server; exit 0 healthy, 1 unhealthy
    help               Show this message

  Options
    --json             Machine-readable output
    --url <url>        health: target URL (default http://127.0.0.1:$PORT/)
    --timeout <sec>    health: request timeout in seconds (default 5)

  Examples
    panda --version
    panda info
    panda health --timeout 3
`)
}

/* ------------------------------------------------------------------ */
/* entrypoint                                                          */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2)

switch (argv[0]) {
  case 'version':
  case '--version':
  case '-v':
    cmdVersion(argv)
    break
  case 'info':
    cmdInfo(argv)
    break
  case 'health':
    cmdHealth(argv)
    break
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    cmdHelp()
    break
  default:
    fail(`unknown command '${argv[0]}'. Run 'panda help' for usage.`)
}
