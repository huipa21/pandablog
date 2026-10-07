import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'

/** Playwright-only process settings, not public/application runtime config.
 * Explicit process values win, then the first defined file value. */
export function loadPlaywrightEnvironment(root = process.cwd(), environment: NodeJS.ProcessEnv = process.env) {
  for (const name of ['.env.e2e.local', '.env.e2e', '.env.local', '.env']) {
    const file = resolve(root, name)
    if (!existsSync(file)) continue
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
      if (value !== undefined && environment[key] === undefined) environment[key] = value
    }
  }
}
