import { readdir, stat, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getMediaSettings } from '../utils/settings'

interface DownloadCronLike {
  validate: (expression: string) => boolean
  schedule: (expression: string, task: () => void | Promise<void>) => {
    stop: () => void
    destroy?: () => void
  }
}

const downloadsRoot = resolve(process.cwd(), 'storage/downloads')

export default defineNitroPlugin(async () => {
  const cron = await resolveDownloadCron()

  if (!cron) {
    console.warn('[media] download cleanup scheduler disabled because node-cron could not be loaded safely')
    return
  }

  const scheduleExpression = '*/30 * * * *'

  if (!cron.validate(scheduleExpression)) {
    console.warn(`[media] invalid download cleanup cron expression: ${scheduleExpression}`)
    return
  }

  // Run every 30 minutes to check for expired download files.
  cron.schedule(scheduleExpression, async () => {
    try {
      const settings = await getMediaSettings()
      const maxAgeMs = (settings.download_cleanup_hours ?? 1) * 60 * 60 * 1000

      let entries: string[]
      try {
        entries = await readdir(downloadsRoot)
      } catch {
        return // Downloads folder doesn't exist yet
      }

      const now = Date.now()
      for (const entry of entries) {
        try {
          const filePath = resolve(downloadsRoot, entry)
          const fileStat = await stat(filePath)
          if (now - fileStat.mtimeMs > maxAgeMs) {
            await unlink(filePath)
          }
        } catch {
          // Skip files that can't be cleaned
        }
      }
    } catch {
      // Cleanup errors are non-critical
    }
  })
})

async function resolveDownloadCron(): Promise<DownloadCronLike | null> {
  const candidates = [
    'node-cron/dist/cjs/node-cron.js',
    'node-cron'
  ]

  for (const candidate of candidates) {
    try {
      const moduleValue = await import(candidate)
      const resolved = normalizeDownloadCron(moduleValue)
      if (resolved) {
        return resolved
      }
    } catch {
      // Try the next candidate module path.
    }
  }

  return null
}

function normalizeDownloadCron(moduleValue: unknown): DownloadCronLike | null {
  const maybeModule = moduleValue as {
    default?: unknown
    schedule?: unknown
    validate?: unknown
  }

  const candidates = [maybeModule.default, maybeModule]
  for (const candidate of candidates) {
    const value = candidate as { schedule?: unknown, validate?: unknown } | undefined
    if (value && typeof value.schedule === 'function' && typeof value.validate === 'function') {
      return value as DownloadCronLike
    }
  }

  return null
}
