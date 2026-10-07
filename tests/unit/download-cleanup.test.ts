import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({resolveCron: vi.fn(), validate: vi.fn(), schedule: vi.fn(), cleanup: vi.fn(), stop: vi.fn(), destroy: vi.fn(), hook: vi.fn()}))
vi.mock('../../server/utils/cron', () => ({resolveCron: mocks.resolveCron}))
vi.mock('../../server/utils/media-archives', () => ({mediaArchiveStore: () => ({cleanup: mocks.cleanup})}))
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  mocks.resolveCron.mockResolvedValue({validate: mocks.validate, schedule: mocks.schedule})
  mocks.validate.mockReturnValue(true)
  mocks.schedule.mockReturnValue({stop: mocks.stop, destroy: mocks.destroy})
  mocks.cleanup.mockResolvedValue(undefined)
})
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals()})
async function install() {
  const {default: plugin} = await import('../../server/plugins/download-cleanup')
  await plugin({hooks: {hook: mocks.hook}} as never)
}
describe('download cleanup shared-cron regression', () => {
  it('keeps its 30-minute schedule, delegates active-safe bounded cleanup and stops on close', async () => {
    await install()
    expect(mocks.schedule).toHaveBeenCalledWith('*/30 * * * *', expect.any(Function))
    await mocks.schedule.mock.calls[0]![1]()
    expect(mocks.cleanup).toHaveBeenCalledOnce()
    expect(mocks.hook).toHaveBeenCalledWith('close', expect.any(Function))
    await mocks.hook.mock.calls[0]![1]()
    expect(mocks.stop).toHaveBeenCalledOnce(); expect(mocks.destroy).toHaveBeenCalledOnce()
  })
  it('does not create a late scheduler after close while cron loading is pending', async () => {
    let resolve!: (value: unknown) => void
    mocks.resolveCron.mockReturnValue(new Promise(yes => {resolve = yes}))
    const {default: plugin} = await import('../../server/plugins/download-cleanup')
    const installing = plugin({hooks: {hook: mocks.hook}} as never)
    await mocks.hook.mock.calls[0]![1]()
    resolve({validate: mocks.validate, schedule: mocks.schedule})
    await installing
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
  it('does not schedule when cron loading fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.resolveCron.mockResolvedValue(null)
    await install()
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('download cleanup scheduler disabled'))
  })
  it('preserves the original require-failure diagnostic', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.resolveCron.mockImplementation(async diagnostic => {diagnostic(new Error('require failed')); return null})
    await install()
    expect(warn).toHaveBeenCalledWith('[media] download cleanup require failed:', 'require failed')
  })
  it('reports incomplete cleanup without throwing into the scheduler', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await install(); mocks.cleanup.mockRejectedValue(new Error('owned fixture failure'))
    await expect(mocks.schedule.mock.calls[0]![1]()).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalledWith('[media] bounded archive cleanup incomplete')
  })
})
