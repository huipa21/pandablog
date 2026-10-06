import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ closeAccessLogStore: vi.fn(), shutdownAccessLogReader: vi.fn() }))
vi.mock('../../server/utils/access-log-store', () => mocks)
vi.mock('../../server/utils/access-log-reader', () => mocks)

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubGlobal('__PB_MODULE_LOGS__', true)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: {} } }))
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  mocks.closeAccessLogStore.mockResolvedValue(undefined)
})
afterEach(() => { vi.unstubAllGlobals() })

async function install() {
  const { default: plugin } = await import('../../server/plugins/access-log-store')
  const hook = vi.fn()
  plugin({ hooks: { hook } } as unknown as Parameters<typeof plugin>[0])
  return hook
}

describe('access file store shutdown plugin', () => {
  it('registers and awaits the file-store close hook without timers or DB flushes', async () => {
    let finish!: () => void
    const done = new Promise<void>(resolve => { finish = resolve })
    mocks.closeAccessLogStore.mockReturnValue(done)
    const hook = await install()
    expect(hook).toHaveBeenCalledExactlyOnceWith('close', expect.any(Function))
    expect(mocks.closeAccessLogStore).not.toHaveBeenCalled()
    const closing = hook.mock.calls[0]![1]()
    expect(mocks.shutdownAccessLogReader).toHaveBeenCalledTimes(1)
    expect(mocks.closeAccessLogStore).toHaveBeenCalledTimes(1)
    finish()
    await closing
  })

  it.each(['build', 'runtime-logs', 'runtime-access'])('does nothing when %s is disabled', async (mode) => {
    if (mode === 'build') vi.stubGlobal('__PB_MODULE_LOGS__', false)
    else vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: { logs: mode === 'runtime-logs' ? { enabled: false } : { accessLogs: false } } } }))
    expect(await install()).not.toHaveBeenCalled()
    expect(mocks.closeAccessLogStore).not.toHaveBeenCalled()
  })
})
