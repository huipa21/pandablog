import { waitForErrorGroupWrites } from '../utils/error-group-write'
import { flushPendingErrorGroups } from '../utils/logging'
import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'

export default defineNitroPlugin((nitroApp) => {
  if (!__PB_MODULE_LOGS__ || !resolveModuleFlags(getRuntimeModuleConfig()).errorLogs) return
  nitroApp.hooks.hook('close', async () => {
    await flushPendingErrorGroups()
    await waitForErrorGroupWrites()
  })
})
