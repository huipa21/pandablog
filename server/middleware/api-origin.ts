import { createError, getRequestHeader, getRequestURL, type H3Event } from 'h3'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Canonical deployment origin is configuration, never forwarded client headers. */
export function validateMutationOrigin(configured: unknown): string {
  try {
    if (typeof configured !== 'string' || !configured || configured.length > 2048) throw new Error('invalid origin')
    const url = new URL(configured)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('invalid origin')
    return url.origin
  } catch {throw createError({statusCode: 503, message: 'Canonical application origin is invalid'})}
}
export function mutationOrigin(event: H3Event): string {
  const config = useRuntimeConfig()
  const configured = typeof config.appOrigin === 'string' ? config.appOrigin : ''
  if (configured) return validateMutationOrigin(configured)
  if (process.env.NODE_ENV === 'production') throw createError({statusCode: 503, message: 'Canonical application origin is required'})
  const url = getRequestURL(event, {xForwardedHost: false, xForwardedProto: false})
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw createError({statusCode: 503, message: 'Configure the canonical application origin'})
  return url.origin // local development only, no forwarded-proxy origin inference
}

export default defineEventHandler(event => {
  const method = event.node.req.method ?? 'GET'
  if (!event.path.split('?')[0]?.startsWith('/api/') || SAFE_METHODS.has(method)) return
  const expected = mutationOrigin(event)
  const site = getRequestHeader(event, 'sec-fetch-site')?.toLowerCase()
  if (site && !['same-origin', 'none'].includes(site)) throw createError({statusCode: 403, message: 'Cross-site API requests are not allowed'})
  const origin = getRequestHeader(event, 'origin')
  if (origin) {
    try {
      const parsed = new URL(origin)
      if (origin.length > 2048 || parsed.username || parsed.password || parsed.origin !== expected || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('untrusted origin')
    } catch {throw createError({statusCode: 403, message: 'Cross-origin API requests are not allowed'})}
    return
  }
  // Explicit non-simple header policy for API clients with no browser metadata.
  // Browsers cannot add it via forms; cross-origin fetch requires a CORS
  // preflight (no wildcard credentialed CORS is supported) and is rejected above.
  // Absence of Origin alone is NEVER proof of a non-browser request.
  if (!site && getRequestHeader(event, 'x-pandablog-client') === 'non-browser') return
  throw createError({statusCode: 403, message: 'Origin metadata or explicit API client opt-in is required'})
})
