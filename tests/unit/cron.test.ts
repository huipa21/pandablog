import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeCronModule, resolveCron } from '../../server/utils/cron'

const loader = vi.hoisted(() => ({ nodeRequire: vi.fn(), base: vi.fn() }))
vi.mock('node:module', () => ({ createRequire: (base: string) => { loader.base(base); return loader.nodeRequire } }))

beforeEach(() => { vi.resetAllMocks() })
afterEach(() => { vi.restoreAllMocks() })
const cron = { validate: vi.fn(() => true), schedule: vi.fn(() => ({ stop: vi.fn() })) }

describe('shared cron loader', () => {
  it('normalizes CommonJS and ESM-default exports without losing the module object', () => {
    expect(normalizeCronModule(cron)).toBe(cron)
    expect(normalizeCronModule({ default: cron })).toBe(cron)
    expect(normalizeCronModule({ default: {}, ...cron })).not.toBeNull()
  })

  it.each([undefined, null, 42, 'invalid', {}, { validate: (): boolean => true }, { schedule: (): void => {} }, { schedule: 'invalid', validate: (): boolean => true }])('rejects unsupported module shapes (%j)', (value) => {
    expect(normalizeCronModule(value)).toBeNull()
  })

  it('requires node-cron relative to the production server entry', async () => {
    vi.resetModules()
    loader.nodeRequire.mockReturnValue({ default: cron })
    const helper = await import('../../server/utils/cron')
    expect(await helper.resolveCron()).toBe(cron)
    expect(loader.nodeRequire).toHaveBeenCalledExactlyOnceWith('node-cron')
    expect(String(loader.base.mock.calls[0]?.[0])).toMatch(/\.output\/server\/index\.mjs$/)
  })

  it('returns null and reports require failures through the caller diagnostic', async () => {
    const error = new Error('module unavailable')
    loader.nodeRequire.mockImplementation(() => { throw error })
    const diagnostic = vi.fn()
    expect(await resolveCron(diagnostic)).toBeNull()
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(error)
  })

  it('does not log directly when no diagnostic is provided', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loader.nodeRequire.mockImplementation(() => { throw new Error('module unavailable') })
    expect(await resolveCron()).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })
})
