import { getRuntimeModuleConfig, resolveModuleFlags } from '~/utils/moduleFlags'

export function useModuleFlags() {
  return resolveModuleFlags(getRuntimeModuleConfig())
}