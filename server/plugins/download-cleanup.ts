import { writeBarrier } from '../utils/maintenance'
import { mediaArchiveStore } from '../utils/media-archives'
import { resolveCron, type CronTaskLike } from '../utils/cron'

export default defineNitroPlugin(async (nitroApp) => {
  let stopped = false
  let task: CronTaskLike | undefined = undefined
  nitroApp.hooks.hook('close', async () => {stopped = true; await task?.stop(); await task?.destroy?.()})
  const cron = await resolveCron(error => {
    console.warn('[media] download cleanup require failed:', error instanceof Error ? error.message : error)
  })
  if (stopped) return
  if (!cron) {console.warn('[media] download cleanup scheduler disabled because node-cron could not be loaded safely'); return}
  const expression = '*/30 * * * *'
  if (!cron.validate(expression)) {console.warn(`[media] invalid download cleanup cron expression: ${expression}`); return}
  task = cron.schedule(expression, async () => {
    if (stopped) return
    try {await writeBarrier.run(() => mediaArchiveStore().cleanup(), true)} catch {console.warn('[media] bounded archive cleanup incomplete')}
  })
})
