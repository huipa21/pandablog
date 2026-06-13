import { getRequestHeader, getRequestIP, readBody, setResponseStatus } from 'h3'
import { isAnalyticsBot } from '../../utils/analytics/bots'
import { lookupAnalyticsGeo } from '../../utils/analytics/geo'
import { hashAnalyticsVisitor } from '../../utils/analytics/hash'
import { normalizeAnalyticsPath, normalizeAnalyticsReferrer } from '../../utils/analytics/path'
import { resolveAnalyticsSession } from '../../utils/analytics/session'
import { queryDb, useDb } from '../../utils/db'
import { getAnalyticsSettings, getRuntimeFlags } from '../../utils/settings'
import { recordIdPart } from '../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  try {
    const settings = getAnalyticsSettings()
    if (!settings.analytics_enabled) {
      return emptyTrackingResponse(event)
    }

    const body = await readBody<Record<string, unknown>>(event).catch((): Record<string, unknown> => ({}))
    const path = normalizeAnalyticsPath(body.path)
    if (!path) {
      return emptyTrackingResponse(event)
    }

    const userAgent = getRequestHeader(event, 'user-agent') ?? ''
    if (isAnalyticsBot(userAgent)) {
      return emptyTrackingResponse(event)
    }

    const ip = getRequestIP(event, { xForwardedFor: getRuntimeFlags().trust_proxy_headers })
      || event.node.req.socket.remoteAddress
      || ''
    if (!ip) {
      return emptyTrackingResponse(event)
    }

    const db = await useDb()
    const now = new Date()
    const visitorHash = await hashAnalyticsVisitor(ip, userAgent)
    const geo = await lookupAnalyticsGeo(ip)
    const session = await resolveAnalyticsSession(
      db,
      visitorHash,
      geo,
      now,
      settings.analytics_session_window_minutes
    )
    const referrer = normalizeAnalyticsReferrer(body.referrer ?? getRequestHeader(event, 'referer'))

    const assignments = [
      'path = $path',
      'visitor_hash = $visitorHash',
      'created_at = $createdAt'
    ]
    const params: Record<string, unknown> = {
      path,
      visitorHash,
      createdAt: now
    }

    if (referrer) {
      assignments.push('referrer = $referrer')
      params.referrer = referrer
    }

    if (session) {
      assignments.push('session = type::record($sessionTable, $sessionId)')
      params.sessionTable = 'analytics_session'
      params.sessionId = recordIdPart(session, 'analytics_session')
    }

    for (const key of ['country', 'region', 'city'] as const) {
      if (geo[key]) {
        assignments.push(`${key} = $${key}`)
        params[key] = geo[key]
      }
    }

    await queryDb(
      db,
      `CREATE pageview SET ${assignments.join(', ')};`,
      params,
      { label: 'analytics pageview create', timeoutMs: 5_000, retryOnReconnect: false }
    )
  } catch (error) {
    if (import.meta.dev) {
      console.warn('[analytics] tracking skipped:', error instanceof Error ? error.message : error)
    }
  }

  return emptyTrackingResponse(event)
})

function emptyTrackingResponse(event: Parameters<typeof setResponseStatus>[0]) {
  setResponseStatus(event, 204)
  return null
}
