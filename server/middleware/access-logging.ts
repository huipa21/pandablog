import { getRequestHeader, getRequestIP, getRequestURL } from 'h3'
import { buildRequestId, logAccess, shouldExcludePath } from '../utils/logging'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)

  if (shouldExcludePath(url.pathname)) {
    return
  }

  const requestId = buildRequestId()
  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)

  const started = Date.now()
  event.node.res.on('finish', () => {
      try {
        const statusCode = event.node.res.statusCode
        const ip = getRequestIP(event, { xForwardedFor: useRuntimeConfig().appEnv === 'prod' })

        logAccess({
          method: event.node.req.method ?? 'GET',
          path: url.pathname,
          status_code: statusCode,
          response_time_ms: Date.now() - started,
          ip,
          user_agent: getRequestHeader(event, 'user-agent') ?? null,
          request_id: requestId,
          query_params: Object.fromEntries(url.searchParams.entries()),
          referrer: getRequestHeader(event, 'referer') ?? null
        })
      } catch {
        // Never let access log errors affect request handling
      }
  })
})
