import { writeBarrier } from '../utils/maintenance'
import { isMaintenanceDiagnosticRequest } from '../utils/maintenance-handler'

export default defineEventHandler((event) => {
  if (!writeBarrier.status().closed) return
  const pathname = getRequestURL(event).pathname
  if (isMaintenanceDiagnosticRequest(event.method, pathname)) return
  setResponseHeader(event, 'Retry-After', 15)
  throw createError({statusCode: 503, message: 'Maintenance or restore recovery is required'})
})
