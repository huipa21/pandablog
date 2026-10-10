import { writeBarrier } from '../utils/maintenance'
import { resolveCron } from '../utils/cron'
import type { CronTaskLike } from '../utils/cron'
import { LOG_RETENTION_SCHEDULE, runLogRetention } from '../utils/log-retention'
import { warn } from '../utils/logging'
import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'

const BOOT_DELAY_MS = 5 * 60_000

export default defineNitroPlugin(async (nitro) => {
  if (!__PB_MODULE_LOGS__ || !resolveModuleFlags(getRuntimeModuleConfig()).logs) {
    return
  }
  let stopped = false
  const run = async () => {
    if (stopped) return
    try {
      await writeBarrier.run(() => runLogRetention(), true)
    } catch (error) {
      warn('[logging] scheduled retention failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }
  // The catch-up pass is useful even when the optional cron loader fails.
  const timer = setTimeout(() => { void run() }, BOOT_DELAY_MS)
  timer.unref?.()
  const scheduled: CronTaskLike[] = []
  nitro.hooks.hook('close', async () => {
    stopped = true
    clearTimeout(timer)
    for (const task of scheduled) {
      await task.stop()
      await task.destroy?.()
    }
  })

  const cron = await resolveCron((error) => {
    warn('[logging] retention cron require failed', { error: error instanceof Error ? error.message : 'Unknown error' })
  })
  if (stopped) return
  if (!cron) {
    warn('[logging] retention cron disabled because node-cron could not be loaded safely')
    return
  }
  // Daily, boot catch-up and admin runs share one DB-only runner.
  for (const schedule of [LOG_RETENTION_SCHEDULE]) {
    try {
      if (!cron.validate(schedule)) {
        warn('[logging] invalid retention cron expression', { schedule })
        continue
      }
      scheduled.push(cron.schedule(schedule, run))
    } catch (error) {
      warn('[logging] retention cron scheduling failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }
})
