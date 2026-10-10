#!/usr/bin/env node
/**
 * PandaBlog build version generator.
 *
 * Emits a commit-datetime + SHA identity, safe to use as an image tag:
 *
 *     YYYYMMDDTHHmmssZ-g<short-sha>  e.g. 20261010T053130Z-g4c426999aa95
 *
 * The datetime is the commit's committer timestamp in UTC, not build time.
 * The short SHA is a fixed 12-character prefix of the full commit SHA.
 * No ancestor history or tags are needed; shallow checkouts work.
 *
 * DETERMINISM CONTRACT
 * --------------------
 * The same commit ALWAYS produces the same string, on any machine, any number
 * of times. Every component is a pure function of the commit object:
 *   - the timestamp is stored inside the commit,
 *   - the SHA prefix is fixed-length, independent of other Git objects.
 * This identifies source, not identical build artifacts; retain image digests.
 *
 * To keep that contract honest this script HARD-FAILS rather than guessing:
 *   - not a git repository      -> no trustworthy date/sha exists
 *   - dirty working tree        -> bytes on disk no longer match the SHA
 *
 * The dirty check can be waived with PANDA_ALLOW_DIRTY=1, which appends a
 * `.dirty` marker so the resulting build is never mistaken for a clean one.
 *
 * Usage:
 *   node scripts/version.mjs              # print the version string
 *   node scripts/version.mjs --json       # print full metadata as JSON
 *   node scripts/version.mjs --commit <c> # inspect a specific commit
 */

import { execFileSync } from 'node:child_process'

const DIRTY_ENV = 'PANDA_ALLOW_DIRTY'

class VersionError extends Error {}

/**
 * Run a git command with a pinned UTC timezone so that date formatting can
 * never differ between a developer machine and CI.
 */
function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, TZ: 'UTC' }
    }).trim()
  } catch (error) {
    const stderr = String(error?.stderr ?? '').trim()
    throw new VersionError(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`)
  }
}

function assertGitAvailable(cwd) {
  try {
    execFileSync('git', ['--version'], { cwd, stdio: 'ignore' })
  } catch {
    throw new VersionError(
      'git executable not found.\n'
      + 'The build version requires a git commit and cannot be invented.\n'
      + 'Install git, or build the Docker image with --build-arg APP_VERSION=<version>.'
    )
  }

  const inside = (() => {
    try {
      return git(['rev-parse', '--is-inside-work-tree'], cwd)
    } catch {
      return 'false'
    }
  })()

  if (inside !== 'true') {
    throw new VersionError(
      'not inside a git work tree.\n'
      + 'The build version requires a git commit and cannot be invented.\n'
      + 'Run from a git checkout, or pass APP_VERSION explicitly.'
    )
  }
}

/**
 * @returns {boolean} true when the tree is dirty and the waiver is active
 */
function checkWorkingTree(cwd) {
  // Untracked-but-not-ignored files are included on purpose: they would be
  // copied into the Docker image, so they change the build just as much as a
  // modified tracked file does. Files matched by .gitignore stay invisible.
  const status = git(['status', '--porcelain'], cwd)
  if (!status) return false

  if (process.env[DIRTY_ENV] === '1') return true

  const files = status.split('\n').slice(0, 10).map((line) => `  ${line}`).join('\n')
  const more = status.split('\n').length > 10 ? '\n  ...' : ''
  throw new VersionError(
    'working tree has uncommitted changes.\n'
    + 'The version pins a commit SHA, so building dirty would label these\n'
    + 'changes with a version that does not contain them.\n'
    + `${files}${more}\n`
    + `Commit the changes, or set ${DIRTY_ENV}=1 to stamp a '.dirty' build.`
  )
}

/**
 * Compute the version metadata for a commit.
 *
 * @param {{ cwd?: string, commit?: string }} [options]
 */
export function computeVersion(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const commit = options.commit ?? 'HEAD'

  assertGitAvailable(cwd)
  const dirty = checkWorkingTree(cwd)

  const sha = git(['rev-parse', '--verify', '--end-of-options', `${commit}^{commit}`], cwd)
  const shortSha = sha.slice(0, 12)
  const epoch = git(['show', '-s', '--format=%ct', sha], cwd)
  const timestamp = new Date(Number(epoch) * 1000)
  if (!/^\d+$/.test(epoch) || !Number.isFinite(timestamp.getTime())) {
    throw new VersionError('unexpected commit timestamp')
  }
  const committedAt = timestamp.toISOString().replace('.000Z', 'Z')
  const datetime = committedAt.replace(/[-:]/g, '')
  if (!/^\d{8}T\d{6}Z$/.test(datetime)) throw new VersionError('unsupported commit timestamp')
  const date = datetime.slice(0, 8)
  const version = `${datetime}-g${shortSha}${dirty ? '.dirty' : ''}`

  return { version, date, sha, shortSha, committedAt, dirty }
}

function main(argv) {
  try {
    let commit
    let json = false
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--json' && !json) json = true
      else if (argv[i] === '--commit' && commit === undefined && argv[i + 1] && !argv[i + 1].startsWith('-')) commit = argv[++i]
      else throw new VersionError('Usage: node scripts/version.mjs [--json] [--commit <commit>]')
    }
    const info = computeVersion({ commit })
    process.stdout.write(json ? `${JSON.stringify(info, null, 2)}\n` : `${info.version}\n`)
  } catch (error) {
    if (error instanceof VersionError) {
      process.stderr.write(`\n[pandablog:version] ${error.message}\n\n`)
      process.exit(1)
    }
    throw error
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('version.mjs')) {
  main(process.argv.slice(2))
}
