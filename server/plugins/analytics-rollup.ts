import { cleanupAnalyticsRetention, rollupCompletedAnalyticsDays } from '../utils/analytics/rollup'
import { ensureAnalyticsGeoDir } from '../utils/analytics/geo'

const CHECK_INTERVAL_MS = 60 * 60 * 1000
let running = false
let lastAttemptDate = ''

export default defineNitroPlugin(() => {
  void ensureAnalyticsGeoDir()
  void runIfDue()

  const timer = setInterval(() => {
    void runIfDue()
  }, CHECK_INTERVAL_MS)
  timer.unref?.()
})

async function runIfDue(now = new Date()) {
  const attemptDate = now.toISOString().slice(0, 10)
  if (running || lastAttemptDate === attemptDate) {
    return
  }

  running = true

  try {
    await rollupCompletedAnalyticsDays(now)
    await cleanupAnalyticsRetention(now)
    lastAttemptDate = attemptDate
  } catch (error) {
    console.warn('[analytics] rollup job failed:', error instanceof Error ? error.message : error)
  } finally {
    running = false
  }
}
