import { normalizePublicSettings, readAppSettings } from '../../utils/settings'

export default defineEventHandler(async () => {
  return { settings: normalizePublicSettings(await readAppSettings()) }
})
