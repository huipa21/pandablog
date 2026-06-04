import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { getLoggingSettings, onLoggingSettingsUpdated, runLoggingCleanup } from '../utils/logging'

const nodeRequire = createRequire(pathToFileURL(resolve(process.cwd(), '.output/server/index.mjs')).href)

interface CronLike {
  validate: (expression: string) => boolean
  schedule: (expression: string, task: () => void) => {
    stop: () => void
    destroy?: () => void
  }
}

let cronImpl: CronLike | null = null
let scheduledTask: ReturnType<CronLike['schedule']> | null = null

export default defineNitroPlugin(async () => {
  cronImpl = await resolveCron()

  if (!cronImpl) {
    console.warn('[logging] cleanup scheduler disabled because node-cron could not be loaded safely')
    return
  }

  scheduleCleanup(getLoggingSettings())

  onLoggingSettingsUpdated((settings) => {
    scheduleCleanup(settings)
  })
})

function scheduleCleanup(settings: ReturnType<typeof getLoggingSettings>) {
  if (scheduledTask) {
    scheduledTask.stop()
    scheduledTask.destroy?.()
    scheduledTask = null
  }

  if (!settings.enabled || !settings.cleanup_enabled) {
    return
  }

  if (!cronImpl) {
    return
  }

  try {
    if (!cronImpl.validate(settings.cleanup_cron)) {
      console.warn(`[logging] invalid cleanup cron expression: ${settings.cleanup_cron}`)
      return
    }

    scheduledTask = cronImpl.schedule(settings.cleanup_cron, () => {
      runLoggingCleanup('scheduled').catch((error) => {
        console.warn(`[logging] scheduled cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      })
    })
  } catch (error) {
    scheduledTask = null
    console.warn(`[logging] cleanup scheduler setup failed: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

async function resolveCron(): Promise<CronLike | null> {
  try {
    return normalizeCron(nodeRequire('node-cron'))
  } catch (error) {
    console.warn('[logging] cleanup require failed:', error instanceof Error ? error.message : error)
    return null
  }
}

function normalizeCron(moduleValue: unknown): CronLike | null {
  const maybeModule = moduleValue as {
    default?: unknown
    schedule?: unknown
    validate?: unknown
  }

  const candidates = [maybeModule.default, maybeModule]
  for (const candidate of candidates) {
    const value = candidate as { schedule?: unknown, validate?: unknown } | undefined
    if (
      value &&
      typeof value.schedule === 'function' &&
      typeof value.validate === 'function'
    ) {
      return value as CronLike
    }
  }

  return null
}
