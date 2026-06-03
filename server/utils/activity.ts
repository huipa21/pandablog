import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'
import { logActivity } from './logging'
import { getRuntimeFlags } from './settings'
import type { ActivityLogEntry } from '~/types/logging'

export function recordActivity(event: H3Event, entry: Omit<ActivityLogEntry, 'ip' | 'request_id'>) {
  logActivity({
    ...entry,
    ip: getRequestIP(event, { xForwardedFor: getRuntimeFlags().trust_proxy_headers }),
    request_id: event.context.requestId ?? null
  })
}
