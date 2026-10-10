import { execFileSync } from 'node:child_process'
import { defineNuxtModule } from '@nuxt/kit'

/**
 * Injects the build version into the server runtime config.
 *
 * The value is deliberately kept in the PRIVATE section of runtimeConfig: the
 * exact build of a public site is useful to an attacker matching known
 * vulnerabilities, so it is served only through the admin-authenticated
 * /api/admin/system/version route, never in the client bundle.
 *
 * Resolution order:
 *   1. APP_VERSION env var  — set by the Dockerfile from a build arg, because
 *      `.git` is excluded from the image build context. Inside Docker this
 *      always wins and git is never consulted.
 *   2. scripts/version.mjs  — derived from git in a normal checkout.
 *
 * If neither works the build FAILS. A fictional fallback version would defeat
 * the entire point of pinning builds to commits.
 *
 * Note on dirty trees: this path deliberately does NOT block on uncommitted
 * changes, because it also runs for `nuxt dev` and `nuxt typecheck`, which you
 * run precisely while the tree is dirty. The strict gate lives in
 * scripts/docker-build.mjs for the standard container path. Local builds are
 * stamped `.dirty`; manually supplied APP_VERSION values are operator labels.
 */
export default defineNuxtModule({
  meta: {
    name: 'pandablog-build-version',
    configKey: 'pandablogBuildVersion'
  },
  setup(_options, nuxt) {
    nuxt.options.runtimeConfig.appVersion = resolveVersion(nuxt.options.rootDir)
  }
})

function resolveVersion(rootDir: string): string {
  const fromEnv = process.env.APP_VERSION?.trim()
  if (fromEnv) return fromEnv

  try {
    return execFileSync(process.execPath, ['scripts/version.mjs'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PANDA_ALLOW_DIRTY: '1' }
    }).trim()
  } catch (error) {
    const detail = String((error as { stderr?: string }).stderr || (error as Error).message).trim()
    throw new Error(
      'Cannot determine the build version.\n'
      + `${detail}\n`
      + 'Set APP_VERSION explicitly, or build from a git checkout (shallow is supported).'
    )
  }
}
