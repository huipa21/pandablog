#!/usr/bin/env node
/**
 * Build the PandaBlog Docker image with build identity wired in.
 *
 * `.git` is excluded by .dockerignore, so the version must be computed on the
 * host and handed to the build as args. This wrapper does that in one step and
 * works identically on Windows, macOS and Linux.
 *
 * Usage:
 *   npm run docker:build
 *   npm run docker:build -- -t myregistry/pandablog:custom
 *   npm run docker:build -- --build-arg NODE_IMAGE=node:22-alpine
 *
 * Any extra arguments are forwarded verbatim to `docker build`. When no -t is
 * given the image is tagged twice: `pandablog:<version>` and `pandablog:latest`.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let info
try {
  const raw = execFileSync(process.execPath, ['scripts/version.mjs', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  info = JSON.parse(raw)
} catch (error) {
  process.stderr.write(String(error.stderr || error.message))
  process.stderr.write('\n[docker:build] aborted — the image must be traceable to a commit.\n')
  process.exit(1)
}

const passthrough = process.argv.slice(2)
const hasTag = passthrough.some((arg) => arg === '-t' || arg === '--tag')

// Docker tags cannot contain '+', which the version uses before the SHA.
const tag = info.version.replace('+', '_')

const args = [
  'build',
  '--build-arg', `APP_VERSION=${info.version}`,
  '--build-arg', `APP_COMMIT=${info.sha}`,
  '--build-arg', `APP_COMMIT_DATE=${info.committedAt}`,
  ...(hasTag ? [] : ['-t', `pandablog:${tag}`, '-t', 'pandablog:latest']),
  ...passthrough,
  '.'
]

process.stdout.write(`[docker:build] version ${info.version}\n`)
process.stdout.write(`[docker:build] docker ${args.join(' ')}\n\n`)

const result = spawnSync('docker', args, { cwd: ROOT, stdio: 'inherit' })
if (result.error) {
  process.stderr.write(`\n[docker:build] failed to run docker: ${result.error.message}\n`)
  process.exit(1)
}
process.exit(result.status ?? 1)
