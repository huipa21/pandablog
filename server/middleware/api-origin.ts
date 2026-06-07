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
})