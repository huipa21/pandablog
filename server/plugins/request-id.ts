import { ensureRequestId } from '../utils/request-id'

export default defineNitroPlugin((nitro) => {
  // Runs before routes, independently of optional logging modules.
  nitro.hooks.hook('request', (event) => { ensureRequestId(event) })
  // Cached handlers may restore old response headers; correlation is not cached.
  nitro.hooks.hook('beforeResponse', (event) => { ensureRequestId(event) })
})
