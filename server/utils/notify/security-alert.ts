import type { H3Event } from 'h3'
import { getRequestHeader, getRequestIP } from 'h3'
import { safeOutboundRequest } from '../net/outbound'
import { getRuntimeFlags, getSecuritySettings } from '../settings'

export type SecurityAlertEvent = 'login.failed' | 'login.locked' | 'login.success' | 'test'

export interface SecurityAlertDetails {
  username?: string | null
  ip?: string | null
  userAgent?: string | null
  reason?: string | null
}

interface SecurityAlertPayload {
  source: 'pandablog'
  event: SecurityAlertEvent
  message: string
  timestamp: string
  username: string | null
  ip: string | null
  user_agent: string | null
  reason: string | null
}

const WEBHOOK_TIMEOUT_MS = 4_000
let activeWebhooks = 0
let droppedAlerts = 0
export function securityAlertDiagnostics() { return { active: activeWebhooks, dropped: droppedAlerts, maxActive: 2, maxWaiting: 0 } }

const EVENT_MESSAGE: Record<SecurityAlertEvent, string> = {
  'login.failed': 'Failed admin login attempt',
  'login.locked': 'Admin login locked after repeated failures',
  'login.success': 'Successful admin login',
  test: 'Test alert from PandaBlog'
}

function eventToggleEnabled(event: SecurityAlertEvent): boolean {
  const settings = getSecuritySettings()
  switch (event) {
    case 'login.failed':
      return settings.security_alert_on_failed_login
    case 'login.locked':
      return settings.security_alert_on_lockout
    case 'login.success':
      return settings.security_alert_on_new_login
    case 'test':
      return true
  }
}

function buildPayload(event: SecurityAlertEvent, details: SecurityAlertDetails): SecurityAlertPayload {
  return {
    source: 'pandablog',
    event,
    message: EVENT_MESSAGE[event],
    timestamp: new Date().toISOString(),
    username: details.username?.slice(0, 64) ?? null,
    ip: details.ip?.slice(0, 64) ?? null,
    user_agent: details.userAgent?.slice(0, 512) ?? null,
    reason: details.reason?.slice(0, 512) ?? null
  }
}

/**
 * Deliver a webhook POST with an SSRF guard and a hard timeout. Throws on any
 * failure (invalid/blocked host, timeout, non-2xx). Used directly by the
 * "send test alert" endpoint so the operator sees the error.
 */
export async function deliverSecurityWebhook(url: string, payload: SecurityAlertPayload): Promise<void> {
  if (activeWebhooks >= 2) { droppedAlerts++; throw new Error('Webhook capacity exceeded') }
  activeWebhooks++
  try {
    await safeOutboundRequest(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), maxRedirects: 0,
      timeoutMs: WEBHOOK_TIMEOUT_MS, statusOnly: true
    })
  } catch {
    // Socket/TLS errors may include the sensitive webhook hostname/path.
    throw new Error('Webhook delivery failed')
  } finally { activeWebhooks-- }
}

/**
 * Fire-and-forget security alert. Respects the global enable flag, the
 * per-event toggle, and a configured webhook URL. Never throws into the
 * request path; delivery failures are logged and swallowed.
 */
export function dispatchSecurityAlert(
  event: SecurityAlertEvent,
  details: SecurityAlertDetails
): void {
  const settings = getSecuritySettings()
  if (!settings.security_alerts_enabled || !settings.security_alert_webhook_url) {
    return
  }
  if (!eventToggleEnabled(event)) {
    return
  }

  const payload = buildPayload(event, details)
  // Drop without launching another promise/log on storms. Diagnostics are
  // finite scalars; there is no hostname/key map or retained payload queue.
  if (activeWebhooks >= 2) { droppedAlerts++; return }
  void deliverSecurityWebhook(settings.security_alert_webhook_url, payload).catch(() => {
    console.warn('[security-alert] webhook delivery failed')
  })
}

/**
 * Build alert details from the current request plus explicit fields.
 */
export function alertDetailsFromEvent(
  event: H3Event,
  extra: Pick<SecurityAlertDetails, 'username' | 'reason'> = {}
): SecurityAlertDetails {
  return {
    username: extra.username ?? null,
    reason: extra.reason ?? null,
    ip: getRequestIP(event, { xForwardedFor: getRuntimeFlags().trust_proxy_headers }) ?? null,
    userAgent: getRequestHeader(event, 'user-agent') ?? null
  }
}

/**
 * Deliver a one-off "test" alert to a specific URL. Throws on failure so the
 * caller (admin test button) can report it.
 */
export async function deliverTestAlert(url: string, details: SecurityAlertDetails): Promise<void> {
  await deliverSecurityWebhook(url, buildPayload('test', details))
}

