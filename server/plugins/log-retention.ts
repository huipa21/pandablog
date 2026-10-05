import { resolveCron } from '../utils/cron'
import type { CronTaskLike } from '../utils/cron'
import { ACCESS_LOG_MAINTENANCE_SCHEDULE, LOG_RETENTION_SCHEDULE, runLogRetention } from '../utils/log-retention'
import { warn } from '../utils/logging'
import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'

const BOOT_DELAY_MS = 5 * 60_000

export default defineNitroPlugin(async (nitro) => {
  if (!__PB_MODULE_LOGS__ || !resolveModuleFlags(getRuntimeModuleConfig()).logs) {
    return
  }
  const run = async () => {
    try {
      await runLogRetention()
    } catch (error) {
      warn('[logging] scheduled retention failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }
  // The catch-up pass is useful even when the optional cron loader fails.
  const timer = setTimeout(() => { void run() }, BOOT_DELAY_MS)
  timer.unref?.()
  const scheduled: CronTaskLike[] = []
  nitro.hooks.hook('close', async () => {
    clearTimeout(timer)
    for (const task of scheduled) {
      await task.stop()
      await task.destroy?.()
    }
  })

  const cron = await resolveCron((error) => {
    warn('[logging] retention cron require failed', { error: error instanceof Error ? error.message : 'Unknown error' })
  })
  if (!cron) {
    warn('[logging] retention cron disabled because node-cron could not be loaded safely')
    return
  }
  // Both schedules, boot catch-up and admin runs use the same single-flight
  // runner. The early pass also applies retention using saved settings.
  for (const schedule of [LOG_RETENTION_SCHEDULE, ACCESS_LOG_MAINTENANCE_SCHEDULE]) {
    try {
      if (!cron.validate(schedule)) {
        warn('[logging] invalid retention cron expression', { schedule })
        continue
      }
      scheduled.push(schedule === ACCESS_LOG_MAINTENANCE_SCHEDULE
        ? cron.schedule(schedule, run, { timezone: 'UTC' })
        : cron.schedule(schedule, run))
    } catch (error) {
      warn('[logging] retention cron scheduling failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }
})
