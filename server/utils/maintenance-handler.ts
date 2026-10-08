import { defineEventHandler, getHeader, getRequestURL, send, setResponseHeader, setResponseStatus, type EventHandler } from 'h3'
import { writeBarrier, type WriteBarrier } from './maintenance'

/** Keep the outer handler and inner middleware diagnostic exceptions identical. */
export function isMaintenanceDiagnosticRequest(method: string, pathname: string) {
  return method === 'GET' && (pathname === '/api/health' || pathname === '/api/ready' || pathname === '/api/admin/backups/status' || pathname.startsWith('/_nuxt/'))
}

interface Guidance { message: string, action: string, recoveryRequired: boolean }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]!))

/** Holds the actual H3 handler promise, not the socket-close event. */
export function wrapMaintenanceHandler(original: EventHandler, barrier: WriteBarrier = writeBarrier, guidance?: () => Guidance): EventHandler {
  const wrapped = defineEventHandler(async event => {
    // Nitro initializes this in h3App's onRequest, which never runs when the
    // fence rejects first; its error handler (useRuntimeConfig) requires it.
    event.context.nitro ||= { errors: [] }
    const pathname = getRequestURL(event).pathname
    if (isMaintenanceDiagnosticRequest(event.method, pathname)
      || (!barrier.status().closed && event.method === 'POST' && /^\/api\/admin\/backups\/(?:backups(?::|%3[Aa]))?[A-Za-z0-9_-]+\/restore$/.test(pathname))) return original(event)
    try {
      return await barrier.run(async () => await original(event))
    } catch (error) {
      if ((error as {data?: {kind?: string}})?.data?.kind !== 'maintenance-fenced') throw error
      // Nuxt renders thrown errors via localFetch('/__nuxt_error'). That route
      // is correctly fenced too: respond here rather than recursively invoking
      // SSR or exempting an error route that can itself perform DB writes.
      setResponseStatus(event, 503, 'Service Unavailable')
      setResponseHeader(event, 'Retry-After', 15)
      setResponseHeader(event, 'Cache-Control', 'no-store')
      const details = guidance?.()
      // A small static page, not SSR: rendering maintenance must never query
      // the DB, start migrations or expose raw errors/configuration values.
      if (details && !pathname.startsWith('/api/') && getHeader(event, 'accept')?.includes('text/html')) {
        setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
        setResponseHeader(event, 'Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
        setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
        return send(event, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PandaBlog temporarily unavailable</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:42rem;margin:12vh auto;padding:0 1.5rem;color:CanvasText;background:Canvas;color-scheme:light dark}h1{font-size:1.6rem}</style></head><body><h1>PandaBlog is temporarily unavailable</h1><p>${escapeHtml(details.message)}</p><p>${details.recoveryRequired ? 'Recovery protection is active. Preserve your database and storage before making changes.' : details.action === 'wait' ? 'This page will work again automatically. Please retry in a moment.' : 'Correct the reported issue and restart PandaBlog, or retry if startup is still in progress.'}</p></body></html>`)
      }
      setResponseHeader(event, 'Content-Type', 'application/json')
      return send(event, JSON.stringify({statusCode: 503, statusMessage: 'Service Unavailable', message: 'Maintenance is fenced', data: {retryAfterSec: 15, ...details}}))
    }
  })
  wrapped.__resolve__ = original.__resolve__
  return wrapped
}
