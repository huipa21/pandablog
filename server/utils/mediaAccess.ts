import type { H3Event } from 'h3'

export function isLocalMediaOnlyEnabled() {
  const config = useRuntimeConfig()
  return config.mediaLocalOnly === true
}

export function assertLocalMediaRequest(event: H3Event) {
  if (!isLocalMediaOnlyEnabled()) {
    return
  }

  if (isLocalRequest(event)) {
    return
  }

  throw createError({ statusCode: 403, statusMessage: 'Media access is limited to local requests' })
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