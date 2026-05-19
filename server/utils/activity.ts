import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'
import { logActivity } from './logging'
import type { ActivityLogEntry } from '~/types/logging'

export function recordActivity(event: H3Event, entry: Omit<ActivityLogEntry, 'ip' | 'request_id'>) {
  logActivity({
    ...entry,
    ip: getRequestIP(event, { xForwardedFor: useRuntimeConfig().appEnv === 'prod' }),
    request_id: event.context.requestId ?? null
  })
}
