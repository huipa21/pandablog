import { getPostVersioningSettings } from '../../../utils/settings'

export default defineEventHandler(async () => {
  const settings = await getPostVersioningSettings()
  return { settings }
})
