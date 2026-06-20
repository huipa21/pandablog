import type { H3Event } from 'h3'
import type { SessionUser } from './users'
import { getMediaSettings } from './settings'

export async function isLocalMediaOnlyEnabled() {
  const settings = await getMediaSettings()
  return settings.local_only === true
}

export async function assertLocalMediaRequest(event: H3Event) {
  if (!await isLocalMediaOnlyEnabled()) {
    return
  }

  if (isLocalRequest(event)) {
    return
  }

  throw createError({ statusCode: 403, statusMessage: 'Media access is limited to local requests' })
}

export async function assertSameSiteMediaRequest(event: H3Event, user?: SessionUser | null) {
  const settings = await getMediaSettings()
  if (settings.prevent_hotlinking !== true) {
    return
  }

  setResponseHeader(event, 'Vary', 'Origin, Referer, Cookie')

  if (user) {
    return
  }

  if (isSameSiteRequest(event)) {
    return
  }

  throw createError({ statusCode: 403, statusMessage: 'Media access is limited to this site' })
}

function isSameSiteRequest(event: H3Event) {
  const requestOrigin = requestSiteOrigin(event)
  const origin = getRequestHeader(event, 'origin')
  if (origin && originMatches(origin, requestOrigin)) {
    return true
  }

  const referer = getRequestHeader(event, 'referer')
  return Boolean(referer && originMatches(referer, requestOrigin))
}

function requestSiteOrigin(event: H3Event) {
  const protocol = getRequestProtocol(event, { xForwardedProto: true })
  const host = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host') || ''
  return `${protocol}://${host}`
}

function originMatches(value: string, expectedOrigin: string) {
  try {
    return new URL(value).origin === new URL(expectedOrigin).origin
  } catch {
    return false
  }
}

function isLocalRequest(event: H3Event) {
  const ip = normalizeIp(getRequestIP(event, { xForwardedFor: true }) || event.node.req.socket.remoteAddress || '')
  if (ip === '127.0.0.1' || ip === '::1') {
    return true
  }

  const host = (getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host') || '').toLowerCase()
  return host.startsWith('localhost:')
    || host === 'localhost'
    || host.startsWith('127.0.0.1:')
    || host === '127.0.0.1'
    || host.startsWith('[::1]:')
    || host === '[::1]'
}

function normalizeIp(value: string) {
  return String(value || '').trim().replace(/^::ffff:/, '')
}