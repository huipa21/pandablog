import { closeAccessLogStore } from '../utils/access-log-store'
import { shutdownAccessLogReader } from '../utils/access-log-reader'
import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'

export default defineNitroPlugin((nitro) => {
  if (!__PB_MODULE_LOGS__ || !resolveModuleFlags(getRuntimeModuleConfig()).accessLogs) return

  nitro.hooks.hook('close', async () => {await Promise.all([closeAccessLogStore(), shutdownAccessLogReader()])})
})
