import { privateMediaHeaders } from '../utils/media-cache'

/** IPX is public and cannot inherit permission to transform mutable media.
 * Ordinary public assets remain supported; use authorized original/variant URLs
 * for media. Encoded and absolute source forms receive the same policy.
 */
export default defineEventHandler((event) => {
  const path = event.path.split('?')[0] ?? ''
  if (!path.startsWith('/_ipx/')) return
  privateMediaHeaders(event)
  let decoded = path
  try {
    for (let i = 0; i < 3; i++) decoded = decodeURIComponent(decoded)
  } catch { throw createError({statusCode: 404, message: 'Not found'}) }
  if (decoded.length > 4096 || /(?:^|[/:])(?:api\/)?media(?:\/|$)/i.test(decoded)) throw createError({statusCode: 404, message: 'Not found'})
})
