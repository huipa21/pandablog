import exportHandler from '../[type]/export.get'

// Keep a concrete child route beneath the static /access list route.
export default defineEventHandler((event) => {
  event.context.params = { ...getRouterParams(event), type: 'access' }
  return exportHandler(event)
})
