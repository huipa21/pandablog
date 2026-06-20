import { flushAccessBuffer } from '../utils/logging-access-buffer'

// Periodically drain the buffered access logs into SurrealDB so the file never
// grows unbounded even when no admin is viewing the logs, and flush on
// shutdown so a graceful restart does not strand buffered entries.
const FLUSH_INTERVAL_MS = 5 * 60 * 1000

export default defineNitroPlugin((nitro) => {
  const timer = setInterval(() => {
    void flushAccessBuffer().catch(() => {})
  }, FLUSH_INTERVAL_MS)
  timer.unref?.()

  nitro.hooks.hook('close', async () => {
    clearInterval(timer)
    await flushAccessBuffer().catch(() => {})
  })
})
