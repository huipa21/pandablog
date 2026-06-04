import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { mediaCleanupOrphanFiles } from '../utils/mediaCleanup'
import { useDb } from '../utils/db'
import { getMediaSettings } from '../utils/settings'

const nodeRequire = createRequire(pathToFileURL(resolve(process.cwd(), '.output/server/index.mjs')).href)

interface MediaCronLike {
  validate: (expression: string) => boolean
  schedule: (expression: string, task: () => void) => {
    stop: () => void
    destroy?: () => void
  }
}

export default defineNitroPlugin(async () => {
  const settings = await getMediaSettings()

  if (!settings.orphan_cleanup_enabled) {
    return
  }

  const cron = await resolveMediaCron()

  if (!cron) {
    console.warn('[media] orphan cleanup scheduler disabled because node-cron could not be loaded safely')
    return
  }

  const days = Number(settings.orphan_cleanup_days || 30)
  const schedule = String(settings.orphan_cleanup_cron || '0 4 * * *')

  if (!cron.validate(schedule)) {
    console.warn(`[media] invalid orphan cleanup cron expression: ${schedule}`)
    return
  }

  cron.schedule(schedule, () => {
    runScheduledMediaCleanup(days).catch((error) => {
      console.warn(`[media] scheduled orphan cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    })
  })
})

async function runScheduledMediaCleanup(days: number) {
  const db = await useDb()
  const result = await mediaCleanupOrphanFiles(db, { olderThanDays: days })

  if (import.meta.dev) {
    console.info(`[media] orphan cleanup deleted ${result.deleted_count} file(s)`)
  }
}

async function resolveMediaCron(): Promise<MediaCronLike | null> {
  try {
    return normalizeMediaCron(nodeRequire('node-cron'))
  } catch (error) {
    console.warn('[media] orphan cleanup require failed:', error instanceof Error ? error.message : error)
    return null
  }
}

function normalizeMediaCron(moduleValue: unknown): MediaCronLike | null {
  const maybeModule = moduleValue as {
    default?: unknown
    schedule?: unknown
    validate?: unknown
  }

  const candidates = [maybeModule.default, maybeModule]
  for (const candidate of candidates) {
    const value = candidate as { schedule?: unknown, validate?: unknown } | undefined
    if (value && typeof value.schedule === 'function' && typeof value.validate === 'function') {
      return value as MediaCronLike
    }
  }

  return null
}
