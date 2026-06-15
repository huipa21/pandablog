import { getRequestHeader, getRequestIP, readBody, setResponseStatus } from 'h3'
import { RecordId } from 'surrealdb'
import { isAnalyticsBot } from '../../utils/analytics/bots'
import { lookupAnalyticsGeo } from '../../utils/analytics/geo'
import { hashAnalyticsVisitor } from '../../utils/analytics/hash'
import { normalizeAnalyticsPath, normalizeAnalyticsReferrer } from '../../utils/analytics/path'
import { resolveAnalyticsSession } from '../../utils/analytics/session'
import { getSessionUser, isAdminTier } from '../../utils/auth'
import { queryDb, useDb } from '../../utils/db'
import { getAnalyticsSettings, getRuntimeFlags } from '../../utils/settings'
import { evaluatePostAccess, type PostVisibility } from '../../utils/visibility'
import { firstRow, recordIdPart, stringifyRecordId } from '../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event).catch((): Record<string, unknown> => ({}))
    const path = normalizeAnalyticsPath(body.path)
    if (!path) {
      return emptyTrackingResponse(event)
    }

    const trackedPostSlug = extractBlogSlug(path)
    const settings = getAnalyticsSettings()
    if (!settings.analytics_enabled && !trackedPostSlug) {
      return emptyTrackingResponse(event)
    }

    const userAgent = getRequestHeader(event, 'user-agent') ?? ''
    if (isAnalyticsBot(userAgent)) {
      return emptyTrackingResponse(event)
    }

    const db = await useDb()

    if (trackedPostSlug) {
      await incrementTrackedPostView(db, event, trackedPostSlug)
    }

    if (!settings.analytics_enabled) {
      return emptyTrackingResponse(event)
    }

    const ip = getRequestIP(event, { xForwardedFor: getRuntimeFlags().trust_proxy_headers })
      || event.node.req.socket.remoteAddress
      || ''
    if (!ip) {
      return emptyTrackingResponse(event)
    }

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

    const pageview: Record<string, unknown> = {
      path,
      visitor_hash: visitorHash,
      created_at: now
    }

    if (referrer) {
      pageview.referrer = referrer
    }

    if (session) {
      pageview.session = new RecordId('analytics_session', recordIdPart(session, 'analytics_session'))
    }

    for (const key of ['country', 'region', 'city'] as const) {
      if (geo[key]) {
        pageview[key] = geo[key]
      }
    }

    await queryDb(
      db,
      'CREATE pageview CONTENT $pageview;',
      { pageview },
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

async function incrementTrackedPostView(db: Awaited<ReturnType<typeof useDb>>, event: Parameters<typeof getSessionUser>[0], slug: string) {
  try {
    const user = await getSessionUser(event).catch(() => null)
    if (isAdminTier(user)) {
      return
    }

    const response = await queryDb(
      db,
      `SELECT id, visibility, author, author_username
       FROM post
       WHERE slug = $slug AND status = 'published'
       LIMIT 1;`,
      { slug },
      { label: 'analytics post view lookup', timeoutMs: 5_000 }
    )
    const post = firstRow<Record<string, unknown>>(response)
    if (!post) {
      return
    }

    const access = await evaluatePostAccess(event, {
      id: stringifyRecordId(post.id),
      visibility: toPostVisibility(post.visibility),
      author: post.author,
      author_username: typeof post.author_username === 'string' ? post.author_username : null
    })

    if (access.state !== 'allow') {
      return
    }

    await queryDb(
      db,
      'UPDATE type::record($table, $id) SET view_count += 1;',
      { table: 'post', id: recordIdPart(stringifyRecordId(post.id), 'post') },
      { label: 'analytics post view count increment', timeoutMs: 5_000, retryOnReconnect: false }
    )
  } catch (error) {
    if (import.meta.dev) {
      console.warn('[analytics] post view count skipped:', error instanceof Error ? error.message : error)
    }
  }
}

function extractBlogSlug(path: string) {
  const url = new URL(path, 'http://local.invalid')
  const match = /^\/blog\/([^/]+)\/?$/.exec(url.pathname)
  const slug = match?.[1]
  return slug ? decodeURIComponent(slug) : null
}

function toPostVisibility(value: unknown): PostVisibility {
  return value === 'private' || value === 'password' ? value : 'public'
}
