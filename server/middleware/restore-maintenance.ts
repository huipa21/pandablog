import { writeBarrier } from '../utils/maintenance'

export default defineEventHandler((event) => {
  if (!writeBarrier.status().closed) return
  const pathname = getRequestURL(event).pathname
  if (event.method === 'GET' && (pathname === '/api/health' || pathname === '/api/admin/backups/status' || pathname === '/favicon.ico' || pathname.startsWith('/_nuxt/'))) return
  setResponseHeader(event, 'Retry-After', 15)
  throw createError({statusCode: 503, message: 'Maintenance or restore recovery is required'})
})
