import { serveOriginalMedia } from '../../../utils/mediaServe'

export default defineEventHandler(async (event) => {
  return await serveOriginalMedia(event, getRouterParam(event, 'id') ?? '', { localOnly: true })
})
