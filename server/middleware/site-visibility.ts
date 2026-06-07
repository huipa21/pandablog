import { getSiteVisibility } from '../utils/visibility'
import { isAuthenticated } from '../utils/auth'

const ALWAYS_ALLOWED_PREFIXES = [
  '/api/auth',
  '/api/site/visibility',
  '/api/health',
  '/_nuxt',
  '/__nuxt',
  '/_ipx',
  '/api/_nuxt'
]

const ALWAYS_ALLOWED_EXACT = new Set([
  '/login',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml'
])

export default defineEventHandler(async (event) => {
  const requestUrl = getRequestURL(event)
  const url = requestUrl.pathname
  const originalUrl = event.node.req.url ?? requestUrl.pathname

  if (ALWAYS_ALLOWED_EXACT.has(url)) return

  for (const prefix of ALWAYS_ALLOWED_PREFIXES) {
    if (url === prefix || url.startsWith(prefix + '/') || url.startsWith(prefix + '?')) {
      return
    }
  }

  const site = await getSiteVisibility()
  if (site === 'public') return

  if (await isAuthenticated(event)) return

  if (url.startsWith('/api/')) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  return sendRedirect(event, `/login?redirect=${encodeURIComponent(originalUrl)}`, 302)
})
