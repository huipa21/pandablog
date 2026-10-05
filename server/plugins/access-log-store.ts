import { closeAccessLogStore } from '../utils/access-log-store'
import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'

export default defineNitroPlugin((nitro) => {
  if (!__PB_MODULE_LOGS__ || !resolveModuleFlags(getRuntimeModuleConfig()).accessLogs) return

  nitro.hooks.hook('close', () => closeAccessLogStore())
})
