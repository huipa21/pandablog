export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Media id is required' })
  }

  const query = getQuery(event)
  const params = new URLSearchParams()

  if (query.download === 'true' || query.download === true) {
    params.set('download', 'true')
  }

  const suffix = params.size ? `?${params.toString()}` : ''
  return sendRedirect(event, `/api/media/file/${encodeURIComponent(id)}${suffix}`, 302)
})
