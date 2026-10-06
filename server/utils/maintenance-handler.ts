import { defineEventHandler, getRequestURL, setResponseHeader, type EventHandler } from 'h3'
import { writeBarrier, type WriteBarrier } from './maintenance'

/** Holds the actual H3 handler promise, not the socket-close event. */
export function wrapMaintenanceHandler(original: EventHandler, barrier: WriteBarrier = writeBarrier): EventHandler {
  const wrapped = defineEventHandler(event => {
    const pathname = getRequestURL(event).pathname
    if ((event.method === 'GET' && (pathname === '/api/health' || pathname === '/api/admin/backups/status' || pathname.startsWith('/_nuxt/')))
      || (!barrier.status().closed && event.method === 'POST' && /^\/api\/admin\/backups\/(?:backups(?::|%3[Aa]))?[A-Za-z0-9_-]+\/restore$/.test(pathname))) return original(event)
    if (barrier.status().closed) setResponseHeader(event, 'Retry-After', 15)
    return barrier.run(async () => await original(event))
  })
  wrapped.__resolve__ = original.__resolve__
  return wrapped
}
