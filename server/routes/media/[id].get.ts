import { serveMediaVariant, serveOriginalMedia } from '../../utils/mediaServe'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Media id is required' })
  }

  const query = getQuery(event)
  const variant = typeof query.variant === 'string' ? query.variant : ''
  if (variant) {
    return await serveMediaVariant(event, id, variant)
  }

  return await serveOriginalMedia(event, id)
})
