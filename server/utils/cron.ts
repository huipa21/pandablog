import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Resolve external packages relative to the built server, as download cleanup
// did before this loader was shared with log retention.
const nodeRequire = createRequire(pathToFileURL(resolve(process.cwd(), '.output/server/index.mjs')).href)

export interface CronTaskLike {
  stop: () => void | Promise<void>
  destroy?: () => void | Promise<void>
}

export interface CronLike {
  validate: (expression: string) => boolean
  schedule: (expression: string, task: () => void | Promise<void>, options?: { timezone?: string }) => CronTaskLike
}

export function normalizeCronModule(moduleValue: unknown): CronLike | null {
  if (!moduleValue || (typeof moduleValue !== 'object' && typeof moduleValue !== 'function')) {
    return null
  }
  const maybeModule = moduleValue as { default?: unknown, schedule?: unknown, validate?: unknown }
  for (const candidate of [maybeModule.default, maybeModule]) {
    const value = candidate as { schedule?: unknown, validate?: unknown } | undefined
    if (value && typeof value.schedule === 'function' && typeof value.validate === 'function') {
      return value as CronLike
    }
  }
  return null
}

export async function resolveCron(onError?: (error: unknown) => void): Promise<CronLike | null> {
  try {
    return normalizeCronModule(nodeRequire('node-cron'))
  } catch (error) {
    onError?.(error)
    return null
  }
}
