import detailHandler from '../[type]/[id].get'

// H3's static /errors parent masks the generic /:type/:id route.
export default defineEventHandler((event) => {
  event.context.params = { ...getRouterParams(event), type: 'errors' }
  return detailHandler(event)
})
