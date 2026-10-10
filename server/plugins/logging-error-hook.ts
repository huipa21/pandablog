import type { H3Event } from 'h3'
import { logError } from '../utils/logging'
import { resolveErrorStatus } from '../utils/logging-logic'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, context) => {
    const event = context?.event as H3Event | undefined

    logError(error, {
      request_id: event?.context?.requestId ?? null,
      path: event ? event.path : null,
      method: event?.node?.req?.method ?? null,
      status_code: resolveErrorStatus(error, event?.node?.res?.statusCode),
      source: 'nitro.error_hook'
    })
  })
})
