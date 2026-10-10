import { randomUUID } from 'node:crypto'
import { getRequestURL, setResponseHeader, type H3Event } from 'h3'

/** Request correlation only: no access logging, settings, DB or filesystem work.
 * Never trust an incoming ID. Reapply the current ID after cached headers.
 */
export function ensureRequestId(event: H3Event): string | undefined {
  const path = getRequestURL(event).pathname
  if (path === '/api/health' || path === '/api/health/') return undefined
  const id = event.context.requestId ??= randomUUID()
  if (!event.node.res.headersSent) setResponseHeader(event, 'x-request-id', id)
  return id
}
