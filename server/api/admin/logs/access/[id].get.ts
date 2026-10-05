import detailHandler from '../[type]/[id].get'

// H3's static /access parent masks the generic /:type/:id route.
export default defineEventHandler((event) => {
  event.context.params = { ...getRouterParams(event), type: 'access' }
  return detailHandler(event)
})
