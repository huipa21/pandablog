import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispatchSecurityAlert, securityAlertDiagnostics } from '../../server/utils/notify/security-alert'

const state = vi.hoisted(() => ({ send: vi.fn(), enabled: true }))
vi.mock('../../server/utils/net/outbound', () => ({ safeOutboundRequest: state.send }))
vi.mock('../../server/utils/settings', () => ({
  getRuntimeFlags: () => ({trust_proxy_headers: true}),
  getSecuritySettings: () => ({security_alerts_enabled: state.enabled, security_alert_webhook_url: 'https://example.com/fixture', security_alert_on_failed_login: true})
}))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('webhook admission (no outgoing requests)', () => {
  it('caps active work, drops storms without retained payloads, clips payload and releases failures', async () => {
    vi.stubGlobal('__PB_MODULE_SECURITY_ALERTS__', true)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const releases: Array<(value: unknown) => void> = []
    state.send.mockImplementation(() => new Promise(resolve => releases.push(resolve)))
    const before = securityAlertDiagnostics().dropped
    for (let i = 0; i < 100; i++) dispatchSecurityAlert('login.failed', {userAgent: 'x'.repeat(4096)})
    expect(state.send).toHaveBeenCalledTimes(2)
    expect(securityAlertDiagnostics()).toMatchObject({active: 2, dropped: before + 98, maxWaiting: 0})
    const opts = state.send.mock.calls[0]![1]
    expect(JSON.parse(opts.body).user_agent.length).toBe(512)
    expect(opts).toMatchObject({statusOnly: true, maxRedirects: 0, timeoutMs: 4000})
    releases.forEach(release => release({}))
    await new Promise(resolve => setImmediate(resolve))
    expect(securityAlertDiagnostics().active).toBe(0)
    state.send.mockRejectedValue(new Error('sensitive URL must not escape'))
    dispatchSecurityAlert('login.failed', {})
    await new Promise(resolve => setImmediate(resolve))
    expect(securityAlertDiagnostics().active).toBe(0)
    expect(console.warn).toHaveBeenCalledWith('[security-alert] webhook delivery failed')
  })
  it('disabled module never starts transport', () => {
    vi.stubGlobal('__PB_MODULE_SECURITY_ALERTS__', false)
    state.send.mockClear()
    dispatchSecurityAlert('login.failed', {})
    expect(state.send).not.toHaveBeenCalled()
  })
})
