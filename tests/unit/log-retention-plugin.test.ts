import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveCron: vi.fn(), validate: vi.fn(), schedule: vi.fn(), stop: vi.fn(), destroy: vi.fn(),
  runLogRetention: vi.fn(), warn: vi.fn()
}))
vi.mock('../../server/utils/cron', () => ({ resolveCron: mocks.resolveCron }))
vi.mock('../../server/utils/log-retention', () => ({ LOG_RETENTION_SCHEDULE: '17 3 * * *', ACCESS_LOG_MAINTENANCE_SCHEDULE: '5 0 * * *', runLogRetention: mocks.runLogRetention }))
vi.mock('../../server/utils/logging', () => ({ warn: mocks.warn }))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('__PB_MODULE_LOGS__', true)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: {} } }))
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  mocks.resolveCron.mockResolvedValue({ validate: mocks.validate, schedule: mocks.schedule })
  mocks.validate.mockReturnValue(true)
  mocks.schedule.mockReturnValue({ stop: mocks.stop, destroy: mocks.destroy })
  mocks.runLogRetention.mockResolvedValue({ deleted: { access: 0, activity: 0, errors: 0 }, errors: [] })
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
  it('registers daily retention plus 00:05 UTC maintenance and defers boot for five minutes', async () => {
    await install()
    expect(mocks.validate.mock.calls).toEqual([['17 3 * * *'], ['5 0 * * *']])
    expect(mocks.schedule).toHaveBeenCalledWith('17 3 * * *', expect.any(Function))
    expect(mocks.schedule).toHaveBeenCalledWith('5 0 * * *', expect.any(Function), { timezone: 'UTC' })
    await vi.advanceTimersByTimeAsync(299_999)
    expect(mocks.runLogRetention).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.runLogRetention).toHaveBeenCalledTimes(1)
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  it('runs retention through the cron callback as well', async () => {
    await install()
    await cronCallback()()
    await cronCallback(1)()
    expect(mocks.runLogRetention).toHaveBeenCalledTimes(2)
    expect(cronCallback(1)).toBe(cronCallback())
  })

  it('clears the boot timeout and stops/destroys cron on shutdown', async () => {
    const hook = await install()
    await closeCallback(hook)()
    await vi.advanceTimersByTimeAsync(300_000)
    expect(mocks.stop).toHaveBeenCalledTimes(2)
    expect(mocks.destroy).toHaveBeenCalledTimes(2)
    expect(mocks.runLogRetention).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['build', 'runtime'])('does not load cron or create timers when %s logs are disabled', async (mode) => {
    if (mode === 'build') vi.stubGlobal('__PB_MODULE_LOGS__', false)
    else vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: { logs: { enabled: false } } } }))
    expect(await install()).not.toHaveBeenCalled()
    expect(mocks.resolveCron).not.toHaveBeenCalled()
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

  it('schedules midnight maintenance even if the regular retention expression is invalid', async () => {
    mocks.validate.mockReturnValueOnce(false)
    await install()
    expect(mocks.schedule).toHaveBeenCalledExactlyOnceWith('5 0 * * *', expect.any(Function), { timezone: 'UTC' })
    await cronCallback()()
    expect(mocks.runLogRetention).toHaveBeenCalledTimes(1)
  })

  it('isolates scheduling failures so the second task still registers and closes', async () => {
    mocks.schedule.mockImplementationOnce(() => { throw new Error('scheduler unavailable') })
    const hook = await install()
    expect(mocks.warn).toHaveBeenCalledWith('[logging] retention cron scheduling failed', { error: 'scheduler unavailable' })
    expect(mocks.schedule).toHaveBeenCalledWith('5 0 * * *', expect.any(Function), { timezone: 'UTC' })
    await closeCallback(hook)()
    expect(mocks.stop).toHaveBeenCalledTimes(1)
    expect(mocks.destroy).toHaveBeenCalledTimes(1)
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
