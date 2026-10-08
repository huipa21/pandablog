#!/usr/bin/env node
/**
 * `panda` — PandaBlog operator CLI (the single CLI shipped in the image).
 *
 * A dependency-free operator tool that ships inside the runtime image. It is
 * deliberately thin: it reports build identity, probes the running server
 * over loopback HTTP and runs the offline recovery assistant. It does NOT
 * reach into the Nitro bundle or the database, because the runtime image
 * contains only a compiled server and importing its internals would break on
 * every Nitro upgrade. Anything needing real data should go through the
 * authenticated /api/admin/* routes instead.
 *
 * Commands (full reference: `panda --help`, `panda help <command>`):
 *   panda version [--json]   Print the build version
 *   panda info [--json]      Build identity + runtime environment
 *   panda health [--json]    Probe the local server; exit 0 healthy, 1 unhealthy
 *   panda recover [...]      Offline startup-recovery assistant (no DB access)
 *   panda help [command]     Show usage
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
    || `http://127.0.0.1:${process.env.NITRO_PORT || process.env.PORT || '3000'}/api/health`
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

/* ------------------------------------------------------------------ */
/* recover                                                             */
/* ------------------------------------------------------------------ */

/**
 * Locate the recovery assistant.
 *
 * In the image it is pre-bundled by the Dockerfile to bin/recover.cjs (no
 * tsx, no sources). In a dev checkout it runs scripts/recover.ts through the
 * installed tsx loader. It always runs as a child process with the app root
 * as working directory, because the assistant resolves ./storage relative to
 * its cwd. The child inherits stdio, and panda exits with its exit code.
 */
function recoveryCommand() {
  const bundled = resolve(HERE, 'recover.cjs')
  if (existsSync(bundled)) return [bundled]

  const source = resolve(APP_ROOT, 'scripts', 'recover.ts')
  const loader = resolve(APP_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs')
  if (existsSync(source) && existsSync(loader)) return ['--import', pathToFileURL(loader).href, source]

  fail(
    'recovery assistant not found.\n'
    + `  Expected ${bundled} (container image) or\n`
    + '  scripts/recover.ts with tsx installed (development checkout; run npm install).'
  )
}

function cmdRecover(args) {
  const command = recoveryCommand()
  const result = spawnSync(process.execPath, [...command, ...args.slice(1)], {
    cwd: APP_ROOT,
    stdio: 'inherit'
  })
  if (result.error) fail(`could not start the recovery assistant: ${result.error.message}`)
  process.exit(result.status ?? 1)
}

/* ------------------------------------------------------------------ */
/* help                                                                */
/* ------------------------------------------------------------------ */

const HELP = {
  overview: `
  panda — PandaBlog operator CLI

  The single operator tool shipped in the PandaBlog runtime image
  (/usr/local/bin/panda -> /app/bin/panda.mjs). It is dependency-free, never
  loads .env secrets, never connects to the database and never prints
  credentials or owner tokens.

  Usage
    panda <command> [options]
    panda help <command>          Detailed help for one command
    panda <command> --help        Same as above

  Commands
    version     Print the build version (YYMMDD-N+g<sha>)
    info        Build identity, runtime environment and storage writability
    health      Probe the local HTTP server; exit 0 healthy, 1 unhealthy
    recover     Offline startup-recovery assistant (read-only by default)
    help        Show this message, or detailed help for one command

  Global options
    -h, --help  Show help (for a command: panda <command> --help)
    --json      Machine-readable output (version, info, health)

  Where to run it
    1. The app container is up — exec into it:
         docker exec pandablog-app panda <command>
         podman exec pandablog-app panda <command>

    2. The app container is NOT up (failed boot, crash loop, fenced startup)
       — start a one-off container from the same image, with the same .env,
       user and ./app-storage mount, from deploy/production/:
         docker compose stop app                  # end the restart loop first
         docker compose run --rm app panda <command>
       The image's command (the web server) is replaced by panda, so the
       server does not start and the boot error does not get in the way.

    3. A development checkout (repository root):
         node bin/panda.mjs <command>
         npm run panda -- <command>

    Command   exec (app up)    compose run (app down)   dev checkout
    version   yes              yes                      yes (from git)
    info      yes              yes                      yes
    health    yes              no: nothing listens,     yes, against a
                               always reports FAIL      running dev server
    recover   inspect only     yes (stop the app        yes
                               first)

  Troubleshooting a container that will not come up
    docker compose logs app --tail 100       # read the boot error first
    docker compose stop app
    docker compose run --rm app panda info     # version + storage writability
    docker compose run --rm app panda recover  # read-only recovery inspection
    # fix configuration (.env) or follow the recover guidance, then:
    docker compose up -d app
    docker exec pandablog-app panda health --url http://127.0.0.1:3000/api/ready

  Exit codes
    0   success / healthy / inspection completed
    1   failure, unhealthy server, refused recovery action or usage error

  Environment
    NITRO_PORT, PORT     Port used by health and shown by info (default 3000)
    NITRO_HOST           Listen host shown by info (default 127.0.0.1)
    PANDABLOG_VERSION    Last-resort version source when version.json and git
                         are both unavailable

  Run 'panda help <command>' for details, e.g. 'panda help recover'.
`,

  version: `
  panda version — print the build version

  Usage
    panda version [--json]
    panda --version | -v

  Prints the deterministic build version, e.g. 260923-1+gedb176f:
    260923     committer date of the commit (YYMMDD, UTC)
    -1         1-based index of that commit among the day's commits
    +gedb176f  abbreviated commit SHA
  A ".dirty" suffix means the image was built from uncommitted changes
  (PANDA_ALLOW_DIRTY=1).

  Version source, in order:
    1. /app/version.json, written at image build time (the container case;
       git is not present in the runtime image)
    2. scripts/version.mjs against git (development checkout)
    3. the PANDABLOG_VERSION environment variable
  If none is available the command fails rather than inventing a version.

  Options
    --json   Print {version, sha, committedAt, dirty, source}

  Examples
    panda --version
    docker compose run --rm app panda version --json
`,

  info: `
  panda info — build identity and runtime environment

  Usage
    panda info [--json]

  Prints:
    Version     build version (and whether it was built from a dirty tree)
    Commit      short SHA and commit date
    Source      where the version came from (version.json, git, env)
    Node        Node.js version and platform/architecture
    NODE_ENV    runtime mode
    Listen      host:port the server is configured to listen on
    App root    application directory (/app in the image)
    Storage     each storage directory as writable (+), read-only (!) or
                missing (x): ${STORAGE_DIRS.join(', ')}

  info only reads local files and environment variables; it does not contact
  the server or the database, so it also works in a one-off container while
  the app is down. A read-only or missing directory usually means the
  ./app-storage bind mount is owned by a different UID:GID than the compose
  "user:" setting.

  Options
    --json   Machine-readable output

  Examples
    docker exec pandablog-app panda info
    docker compose run --rm app panda info --json
`,

  health: `
  panda health — probe the local HTTP server

  Usage
    panda health [--url <url>] [--timeout <seconds>] [--json]

  Sends GET to the server over loopback and exits:
    0   the server answered with a non-5xx status (2xx, 3xx and 4xx count
        as healthy: the process is up and routing requests)
    1   5xx status, connection refused, DNS error or timeout

  Default URL is http://127.0.0.1:$PORT/api/health (PORT from NITRO_PORT,
  then PORT, then 3000). Useful targets:
    /api/health        liveness only: no DB, no settings, no auth
    /api/health?db=1   adds a DB connectivity probe (RETURN 1, 2 s deadline);
                       503 when the database is down
    /api/ready         readiness: 200 only after startup finished and
                       admission is open; 503 while initializing, fenced,
                       in maintenance or shutting down. The production
                       compose healthcheck uses this target.

  health only makes sense where the server runs (docker exec into the app
  container, or a dev machine with the server running). In a one-off
  'docker compose run' container nothing listens, so it always reports FAIL.

  Options
    --url <url>          Target URL (default http://127.0.0.1:$PORT/api/health)
    --timeout <seconds>  Request timeout (default 5)
    --json               Print {ok, url, status, latencyMs, detail}

  Examples
    docker exec pandablog-app panda health
    docker exec pandablog-app panda health --url http://127.0.0.1:3000/api/ready --timeout 4
`,

  recover: `
  panda recover — offline startup-recovery assistant

  Usage
    panda recover                 Read-only inspection (the normal use)
    panda recover --archive-reviewed-startup \\
      --app-stopped --database-quiescent --data-consistent
                                  Expert-only archival of reviewed records
    panda recover --help          Show this message

  What it does
    Inspects the recovery records under storage/backups (.writer.lock,
    .uncertain-writes.json, restore journals and restore artifacts) and
    explains whether anything blocks a restart. It does not load .env,
    never connects to the database, never runs SQL and never prints owner
    tokens or record contents. Plain inspection changes nothing.

  When to use it
    /api/ready reports guidance action "run-recovery-assistant", or the boot
    log says the service "remains fenced; run panda recover for guidance".
    You do NOT need it when:
      - the database is unreachable: the app retries by itself and opens
        when the database answers (/api/ready: state "initializing");
      - configuration is invalid or sign-in was rejected before any write:
        fix .env, then recreate the container (docker compose up -d app).

  Run it with the app stopped
    docker compose stop app
    docker compose run --rm app panda recover
  Inside a running container (docker exec) only inspection is meaningful:
  a live writer is reported as "writer-active" and is never archived.

  Inspection results
    clear                     No persisted recovery blocker. Check /api/ready
                              and the logs for a configuration error.
    writer-active             The recorded writer process is running. This is
                              normal; no recovery action is indicated.
    review-required           Startup-only receipts (for example a writer lock
                              left by a killed process: SIGKILL, OOM, power
                              loss) need evidence this tool cannot establish.
                              Expert-reviewed archival is available.
    manual-recovery-required  Restore journals/artifacts, maintenance jobs,
                              writer ownership from another host, or corrupt
                              records. Nothing is changed; follow the offline
                              recovery runbook.

  Expert-only archival
    Moves only the reviewed .writer.lock (and any .uncertain-writes.json)
    into storage/.recovery-archive/startup-<timestamp>/ with a review
    record. No database, media or setup data is modified, nothing is
    deleted. It requires ALL three flags. They are your assertions, not
    checks the tool can perform; never pass a flag for a fact you have not
    established:
      --app-stopped          no PandaBlog process uses this storage/database
      --database-quiescent   no operation from the old process can still
                             execute on the database
      --data-consistent      database and media were independently verified
                             consistent, and a backup is preserved
    A dead PID alone does not prove the database stopped executing the old
    process's queries. Restore journals/artifacts, live, remote, corrupt or
    unrecognized ownership are always refused. There is no force option and
    no public unfence endpoint.

    Container note: the writer lock records the container hostname. The
    production compose file sets a fixed "hostname: pandablog-app", so a
    one-off 'docker compose run' container matches the app container's
    hostname. Without it, a lock written by the app is reported as
    "another host" and archival is refused. PID numbering restarts in every
    container, so a recorded PID that now belongs to this tool is reported
    as not running here. That is NOT evidence the app is stopped: a one-off
    container cannot see the app container's processes. Always run
    'docker compose stop app' first.

    After archival: start exactly one PandaBlog instance and verify
      docker exec pandablog-app panda health --url http://127.0.0.1:3000/api/ready

  Options
    --archive-reviewed-startup   Archive reviewed startup-only receipts
    --app-stopped                Assertion: the app is stopped
    --database-quiescent         Assertion: the database is quiescent
    --data-consistent            Assertion: data is verified consistent
  Any other option is rejected.

  Runbook: docs/runtime-startup-config/operations.md (Local recovery assistant)
           docs/backend-hardening/operations.md (Offline recovery)
`
}

HELP.help = HELP.overview

function cmdHelp(topic) {
  if (topic === undefined) {
    out(HELP.overview)
    return
  }
  const key = topic === '--version' || topic === '-v' ? 'version' : topic
  if (!Object.hasOwn(HELP, key)) fail(`no help for '${topic}'. Run 'panda help' for the command list.`)
  out(HELP[key])
}

/* ------------------------------------------------------------------ */
/* entrypoint                                                          */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2)
const wantsHelp = argv.includes('--help') || argv.includes('-h')

switch (argv[0]) {
  case 'version':
  case '--version':
  case '-v':
    if (wantsHelp) cmdHelp('version')
    else cmdVersion(argv)
    break
  case 'info':
    if (wantsHelp) cmdHelp('info')
    else cmdInfo(argv)
    break
  case 'health':
    if (wantsHelp) cmdHelp('health')
    else cmdHealth(argv)
    break
  case 'recover':
    if (wantsHelp) cmdHelp('recover')
    else cmdRecover(argv)
    break
  case undefined:
  case '--help':
  case '-h':
    cmdHelp()
    break
  case 'help':
    cmdHelp(argv[1])
    break
  default:
    fail(`unknown command '${argv[0]}'. Run 'panda --help' for usage.`)
}
