import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveCron: vi.fn(), validate: vi.fn(), schedule: vi.fn(), stop: vi.fn(), destroy: vi.fn(),
  runLogRetention: vi.fn(), warn: vi.fn()
}))
vi.mock('../../server/utils/cron', () => ({ resolveCron: mocks.resolveCron }))
vi.mock('../../server/utils/log-retention', () => ({ LOG_RETENTION_SCHEDULE: '17 3 * * *', runLogRetention: mocks.runLogRetention }))
vi.mock('../../server/utils/logging', () => ({ warn: mocks.warn }))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('useRuntimeConfig', () => ({ public: {} }))
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  mocks.resolveCron.mockResolvedValue({ validate: mocks.validate, schedule: mocks.schedule })
  mocks.validate.mockReturnValue(true)
  mocks.schedule.mockReturnValue({ stop: mocks.stop, destroy: mocks.destroy })
  mocks.runLogRetention.mockResolvedValue({ deleted: { activity: 0, errors: 0 }, errors: [] })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function install() {
  const { default: plugin } = await import('../../server/plugins/log-retention')
  const hook = vi.fn()
  await plugin({ hooks: { hook } } as unknown as Parameters<typeof plugin>[0])
  return hook
}

function cronCallback(index = 0): () => Promise<void> {
  return mocks.schedule.mock.calls[index]?.[1]
}
function closeCallback(hook: ReturnType<typeof vi.fn>): () => Promise<void> {
  return hook.mock.calls.find(call => call[0] === 'close')?.[1]
}

describe('retention scheduler', () => {
  it('registers only daily DB retention and defers boot for five minutes', async () => {
    await install()
    expect(mocks.validate.mock.calls).toEqual([['17 3 * * *']])
    expect(mocks.schedule).toHaveBeenCalledExactlyOnceWith('17 3 * * *', expect.any(Function))
    await vi.advanceTimersByTimeAsync(299_999)
    expect(mocks.runLogRetention).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.runLogRetention).toHaveBeenCalledTimes(1)
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  it('runs retention through the cron callback as well', async () => {
    await install()
    await cronCallback()()
    expect(mocks.runLogRetention).toHaveBeenCalledTimes(1)
  })

  it('does not install late cron tasks after close during asynchronous loading', async () => {
    let resolve!: (value: unknown) => void
    mocks.resolveCron.mockReturnValue(new Promise(yes => {resolve = yes}))
    const {default: plugin} = await import('../../server/plugins/log-retention')
    const hook = vi.fn(), installing = plugin({hooks: {hook}} as never)
    await closeCallback(hook)()
    resolve({validate: mocks.validate, schedule: mocks.schedule})
    await installing
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears the boot timeout and stops/destroys cron on shutdown', async () => {
    const hook = await install()
    await closeCallback(hook)()
    await vi.advanceTimersByTimeAsync(300_000)
    expect(mocks.stop).toHaveBeenCalledTimes(1)
    expect(mocks.destroy).toHaveBeenCalledTimes(1)
    expect(mocks.runLogRetention).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves boot catch-up when cron is unavailable and still cleans up the timeout', async () => {
    mocks.resolveCron.mockResolvedValue(null)
    const hook = await install()
    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('cron disabled'))
    await vi.advanceTimersByTimeAsync(300_000)
    expect(mocks.runLogRetention).toHaveBeenCalledTimes(1)
    await closeCallback(hook)()
    expect(mocks.stop).not.toHaveBeenCalled()
  })

  it('does not schedule invalid cron but still performs boot catch-up', async () => {
    mocks.validate.mockReturnValue(false)
    await install()
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('invalid retention cron'), { schedule: '17 3 * * *' })
    await vi.advanceTimersByTimeAsync(300_000)
    expect(mocks.runLogRetention).toHaveBeenCalledTimes(1)
  })

  it('reports a scheduling failure and still cleans up boot catch-up', async () => {
    mocks.schedule.mockImplementationOnce(() => { throw new Error('scheduler unavailable') })
    const hook = await install()
    expect(mocks.warn).toHaveBeenCalledWith('[logging] retention cron scheduling failed', { error: 'scheduler unavailable' })
    await closeCallback(hook)()
    expect(mocks.stop).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('catches unexpected runner rejections from cron and boot callbacks', async () => {
    mocks.runLogRetention.mockRejectedValue(new Error('run failed'))
    await install()
    await cronCallback()()
    await vi.advanceTimersByTimeAsync(300_000)
    expect(mocks.warn).toHaveBeenCalledTimes(2)
    expect(mocks.warn).toHaveBeenCalledWith('[logging] scheduled retention failed', { error: 'run failed' })
  })
})
