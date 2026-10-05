import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ flushPendingErrorGroups: vi.fn(), waitForErrorGroupWrites: vi.fn() }))
vi.mock('../../server/utils/logging', () => mocks)
vi.mock('../../server/utils/error-group-write', () => mocks)
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  vi.stubGlobal('defineNitroPlugin', (handler: unknown) => handler)
  vi.stubGlobal('__PB_MODULE_LOGS__', true)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: {} } }))
})
afterEach(() => vi.unstubAllGlobals())
describe('error group shutdown plugin', () => {
  it('flushes suppressed counts before awaiting all serialized writes on close', async () => {
    const hooks = { hook: vi.fn() }
    const { default: plugin } = await import('../../server/plugins/error-groups')
    plugin({ hooks } as any)
    expect(hooks.hook).toHaveBeenCalledWith('close', expect.any(Function))
    await hooks.hook.mock.calls[0]![1]()
    expect(mocks.flushPendingErrorGroups).toHaveBeenCalledOnce()
    expect(mocks.waitForErrorGroupWrites).toHaveBeenCalledOnce()
    expect(mocks.flushPendingErrorGroups.mock.invocationCallOrder[0]).toBeLessThan(mocks.waitForErrorGroupWrites.mock.invocationCallOrder[0]!)
  })
  it.each(['build', 'logs', 'errors'])('is a no-op with %s disabled', async mode => {
    if (mode === 'build') vi.stubGlobal('__PB_MODULE_LOGS__', false)
    else vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: { logs: mode === 'logs' ? { enabled: false } : { errorLogs: false } } } }))
    const hooks = { hook: vi.fn() }
    const { default: plugin } = await import('../../server/plugins/error-groups')
    plugin({ hooks } as any)
    expect(hooks.hook).not.toHaveBeenCalled()
  })
})
