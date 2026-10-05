import { mediaArchiveStore } from '../utils/media-archives'
import { resolveCron } from '../utils/cron'

export default defineNitroPlugin(async (nitroApp) => {
  const cron = await resolveCron(error => {
    console.warn('[media] download cleanup require failed:', error instanceof Error ? error.message : error)
  })
  if (!cron) {console.warn('[media] download cleanup scheduler disabled because node-cron could not be loaded safely'); return}
  const expression = '*/30 * * * *'
  if (!cron.validate(expression)) {console.warn(`[media] invalid download cleanup cron expression: ${expression}`); return}
  const task = cron.schedule(expression, async () => {
    try {await mediaArchiveStore().cleanup()} catch {console.warn('[media] bounded archive cleanup incomplete')}
  })
  nitroApp.hooks.hook('close', () => {task.stop(); task.destroy?.()})
})
