import { setResponseHeader, setResponseStatus } from 'h3'
import { startup } from '../utils/startup'

/** Readiness is not liveness. No ownership tokens, paths or raw errors. */
export default defineEventHandler(event => {
  const status = startup.status()
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (!status.ready) {
    setResponseHeader(event, 'Retry-After', 15)
    // An expected readiness failure is not an application exception: returning
    // it avoids Nuxt error-page SSR and DB-backed error logging while fenced.
    setResponseStatus(event, 503, 'Service Unavailable')
  }
  return {...status, ...(!status.ready ? {guidance: startup.guidance()} : {})}
})
