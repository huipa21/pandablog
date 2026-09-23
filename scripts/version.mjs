#!/usr/bin/env node
/**
 * PandaBlog build version generator.
 *
 * Emits a date-based, commit-pinned version string:
 *
 *     YYMMDD-N+g<short-sha>          e.g. 260923-1+gedb176f
 *
 *   YYMMDD  committer date of the commit being built, in UTC
 *   N       1-based index of that commit among same-day commits reachable
 *           from it via --first-parent
 *   +g...   7-char abbreviated commit SHA
 *
 * DETERMINISM CONTRACT
 * --------------------
 * The same commit ALWAYS produces the same string, on any machine, any number
 * of times. Every component is a pure function of the commit object:
 *   - the date is stored inside the commit,
 *   - N counts only ancestors-or-self of that commit, so later commits landing
 *     on the same day can never renumber an older build,
 *   - the SHA is the identity itself.
 *
 * To keep that contract honest this script HARD-FAILS rather than guessing:
 *   - not a git repository      -> no trustworthy date/sha exists
 *   - shallow clone             -> N would be silently undercounted
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
      + 'The build version is derived from git history and cannot be invented.\n'
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
      + 'The build version is derived from git history and cannot be invented.\n'
      + 'Run from a git checkout, or pass APP_VERSION explicitly.'
    )
  }
}

function assertNotShallow(cwd) {
  if (git(['rev-parse', '--is-shallow-repository'], cwd) === 'true') {
    throw new VersionError(
      'shallow clone detected.\n'
      + 'Commit counting requires full history; a shallow clone silently\n'
      + 'undercounts N and would emit a WRONG version for the same SHA.\n'
      + 'Fix with:  git fetch --unshallow\n'
      + 'In GitHub Actions set: actions/checkout@v4 with fetch-depth: 0'
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
  assertNotShallow(cwd)
  const dirty = checkWorkingTree(cwd)

  const sha = git(['rev-parse', commit], cwd)
  const shortSha = git(['rev-parse', '--short=7', commit], cwd)
  const date = git(['show', '-s', '--date=format-local:%y%m%d', '--format=%cd', commit], cwd)
  const committedAt = git(['show', '-s', '--date=iso-strict-local', '--format=%cd', commit], cwd)

  if (!/^\d{6}$/.test(date)) {
    throw new VersionError(`unexpected commit date format: ${date}`)
  }

  // Count same-day commits along the first-parent chain ending at `commit`.
  // Using --first-parent keeps merge commits from side branches out of the
  // sequence; anchoring the walk at `commit` (not at HEAD or at a branch tip)
  // is what makes N immutable for a given SHA.
  const sameDay = git(
    ['log', '--first-parent', '--format=%cd', '--date=format-local:%y%m%d', sha],
    cwd
  )
    .split('\n')
    .filter((line) => line === date).length

  if (sameDay < 1) {
    throw new VersionError(`could not locate commit ${shortSha} in its own history`)
  }

  const version = `${date}-${sameDay}+g${shortSha}${dirty ? '.dirty' : ''}`

  return { version, date, sequence: sameDay, sha, shortSha, committedAt, dirty }
}

function main(argv) {
  const commitFlag = argv.indexOf('--commit')
  const commit = commitFlag !== -1 ? argv[commitFlag + 1] : undefined

  try {
    const info = computeVersion({ commit })
    process.stdout.write(argv.includes('--json') ? `${JSON.stringify(info, null, 2)}\n` : `${info.version}\n`)
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
