import exportHandler from '../[type]/export.get'

export default defineEventHandler((event) => {
  event.context.params = { ...getRouterParams(event), type: 'errors' }
  return exportHandler(event)
})
