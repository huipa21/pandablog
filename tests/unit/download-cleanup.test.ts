import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveCron: vi.fn(), validate: vi.fn(), schedule: vi.fn(),
  getMediaSettings: vi.fn(), readdir: vi.fn(), stat: vi.fn(), unlink: vi.fn()
}))
vi.mock('../../server/utils/cron', () => ({ resolveCron: mocks.resolveCron }))
vi.mock('../../server/utils/settings', () => ({ getMediaSettings: mocks.getMediaSettings }))
vi.mock('node:fs/promises', () => mocks)

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-04T10:00:00Z'))
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  mocks.resolveCron.mockResolvedValue({ validate: mocks.validate, schedule: mocks.schedule })
  mocks.validate.mockReturnValue(true)
  mocks.getMediaSettings.mockResolvedValue({ download_cleanup_hours: 2 })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function install() {
  const { default: plugin } = await import('../../server/plugins/download-cleanup')
  await plugin({} as Parameters<typeof plugin>[0])
}
function cleanup(): () => Promise<void> {
  return mocks.schedule.mock.calls[0]?.[1]
}

describe('download cleanup shared-cron regression', () => {
  it('keeps its 30-minute schedule and only removes expired files', async () => {
    await install()
    expect(mocks.schedule).toHaveBeenCalledWith('*/30 * * * *', expect.any(Function))
    mocks.readdir.mockResolvedValue(['old.zip', 'new.zip'])
    mocks.stat.mockResolvedValueOnce({ mtimeMs: Date.now() - 3 * 60 * 60_000 }).mockResolvedValueOnce({ mtimeMs: Date.now() - 60_000 })
    await cleanup()()
    expect(mocks.unlink).toHaveBeenCalledExactlyOnceWith(resolve(process.cwd(), 'storage/downloads/old.zip'))
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
    mocks.resolveCron.mockImplementation(async (diagnostic) => { diagnostic(new Error('require failed')); return null })
    await install()
    expect(warn).toHaveBeenCalledWith('[media] download cleanup require failed:', 'require failed')
  })

  it('still ignores missing folders and individual file failures', async () => {
    await install()
    mocks.readdir.mockRejectedValueOnce(new Error('missing folder'))
    await expect(cleanup()()).resolves.toBeUndefined()
    mocks.readdir.mockResolvedValue(['bad.zip', 'old.zip'])
    mocks.stat.mockRejectedValueOnce(new Error('bad file')).mockResolvedValueOnce({ mtimeMs: Date.now() - 3 * 60 * 60_000 })
    await expect(cleanup()()).resolves.toBeUndefined()
    expect(mocks.unlink).toHaveBeenCalledExactlyOnceWith(resolve(process.cwd(), 'storage/downloads/old.zip'))
  })
})
