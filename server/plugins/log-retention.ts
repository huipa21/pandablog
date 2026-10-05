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
  let scheduled: CronTaskLike | undefined
  nitro.hooks.hook('close', async () => {
    clearTimeout(timer)
    await scheduled?.stop()
    await scheduled?.destroy?.()
  })

  const cron = await resolveCron((error) => {
    warn('[logging] retention cron require failed', { error: error instanceof Error ? error.message : 'Unknown error' })
  })
  if (!cron) {
    warn('[logging] retention cron disabled because node-cron could not be loaded safely')
    return
  }
  try {
    if (!cron.validate(LOG_RETENTION_SCHEDULE)) {
      warn('[logging] invalid retention cron expression', { schedule: LOG_RETENTION_SCHEDULE })
      return
    }
    scheduled = cron.schedule(LOG_RETENTION_SCHEDULE, run)
  } catch (error) {
    warn('[logging] retention cron scheduling failed', { error: error instanceof Error ? error.message : 'Unknown error' })
  }
})
