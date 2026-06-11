const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const ALLOWED_PREFIXES = [
  '/api/auth',
  '/api/site/visibility'
]

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const method = event.node.req.method ?? 'GET'

  if (!url.pathname.startsWith('/api/') || SAFE_METHODS.has(method)) {
    return
  }

  for (const prefix of ALLOWED_PREFIXES) {
    if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) {
      return
    }
  }

  const fetchSite = String(getRequestHeader(event, 'sec-fetch-site') ?? '').toLowerCase()
  if (fetchSite === 'cross-site') {
    throw createError({ statusCode: 403, message: 'Cross-site API requests are not allowed' })
  }

  // Origin-header fallback: for clients that send Origin but no Sec-Fetch-Site
  // (older browsers), reject when the Origin host differs from the request host.
  // A missing Origin AND missing Sec-Fetch-Site indicates a non-browser client
  // (no ambient cookies → not a CSRF vector), so it is allowed through.
  const origin = getRequestHeader(event, 'origin')
  if (origin) {
    let originHost: string
    try {
      originHost = new URL(origin).host
    } catch {
      throw createError({ statusCode: 403, message: 'Invalid Origin header' })
    }
    if (originHost !== url.host) {
      throw createError({ statusCode: 403, message: 'Cross-origin API requests are not allowed' })
    }
  }
})