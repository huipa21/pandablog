import { getSiteVisibility } from '../utils/visibility'
import { isAdminAuthenticated } from '../utils/auth'

const ALWAYS_ALLOWED_PREFIXES = [
  '/admin',
  '/api/admin',
  '/api/auth',
  '/api/site/settings',
  '/api/site/visibility',
  '/api/health',
  '/_nuxt',
  '/__nuxt',
  '/_ipx',
  '/api/_nuxt'
]

const ALWAYS_ALLOWED_EXACT = new Set([
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml'
])

export default defineEventHandler(async (event) => {
  const url = event.path ?? ''
  const originalUrl = event.node.req.url ?? url

  if (ALWAYS_ALLOWED_EXACT.has(url)) return

  for (const prefix of ALWAYS_ALLOWED_PREFIXES) {
    if (url === prefix || url.startsWith(prefix + '/') || url.startsWith(prefix + '?')) {
      return
    }
  }

  const site = await getSiteVisibility()
  if (site === 'public') return

  if (await isAdminAuthenticated(event)) return

  return sendRedirect(event, `/admin/login?redirect=${encodeURIComponent(originalUrl)}`, 302)
})
