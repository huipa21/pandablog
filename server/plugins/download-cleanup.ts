import { readdir, stat, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getMediaSettings } from '../utils/settings'
import { resolveCron } from '../utils/cron'

const downloadsRoot = resolve(process.cwd(), 'storage/downloads')

export default defineNitroPlugin(async () => {
  const cron = await resolveCron((error) => {
    console.warn('[media] download cleanup require failed:', error instanceof Error ? error.message : error)
  })

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
