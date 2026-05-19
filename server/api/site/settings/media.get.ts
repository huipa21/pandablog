import { getMediaSettings } from '../../../utils/settings'

export default defineEventHandler(async () => {
  const settings = await getMediaSettings()
  return { settings }
})
