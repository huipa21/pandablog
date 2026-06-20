import { serveMediaVariant } from '../../../../utils/mediaServe'

export default defineEventHandler(async (event) => {
  return await serveMediaVariant(event, getRouterParam(event, 'id') ?? '', getRouterParam(event, 'size') ?? '', { localOnly: true })
})
