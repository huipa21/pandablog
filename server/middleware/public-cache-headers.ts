import { appendResponseHeader, setResponseHeader } from 'h3'
import {
  PUBLIC_LIST_CACHE_SECONDS,
  PUBLIC_POST_CACHE_SECONDS,
  publicCacheControl,
  shouldBypassPublicCache
} from '../utils/public-cache'

export default defineEventHandler(async (event) => {
  const method = event.node.req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    return
  }

  const maxAge = getPageCacheMaxAge(getRequestURL(event).pathname)
  if (!maxAge) {
    return
  }

  appendResponseHeader(event, 'Vary', 'Cookie')

  if (await shouldBypassPublicCache(event)) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return
  }

  setResponseHeader(event, 'Cache-Control', publicCacheControl(maxAge))
})

function getPageCacheMaxAge(pathname: string) {
  if (pathname === '/') {
    return PUBLIC_LIST_CACHE_SECONDS
  }

  if (/^\/blog\/[^/]+\/?$/.test(pathname)) {
    return PUBLIC_POST_CACHE_SECONDS
  }

  if (/^\/(category|tag)\/[^/]+\/?$/.test(pathname)) {
    return PUBLIC_LIST_CACHE_SECONDS
  }

  return 0
}