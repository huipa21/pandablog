import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBackupSettings } from '../../server/utils/settings'

const mocks = vi.hoisted(() => ({ queryDb: vi.fn(), useDb: vi.fn(), requireSuperadmin: vi.fn(), readBody: vi.fn() }))
vi.mock('../../server/utils/db', () => mocks)
vi.mock('../../server/utils/auth', () => ({ requireSuperadmin: mocks.requireSuperadmin }))
// These settings imports are unrelated to backups; avoid their Nuxt/session dependencies.
vi.mock('../../server/utils/users', () => ({}))
vi.mock('../../server/utils/posts', () => ({ ADMIN_POST_DISPLAY_MODE_KEY: 'admin_post_display_mode', normalizeAdminPostDisplayMode: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.useDb.mockResolvedValue({})
  mocks.queryDb.mockResolvedValue([[]])
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('readBody', mocks.readBody)
  vi.stubGlobal('createError', (error: { message: string, statusCode: number }) => Object.assign(new Error(error.message), error))
})
afterEach(() => vi.unstubAllGlobals())

describe('backup settings', () => {
  it.each([undefined, null, 'invalid', {}, { include_access_logs: 'true' }, { include_access_logs: 1 }])('defaults legacy/malformed settings %j to exclusion', async value => {
    mocks.queryDb.mockResolvedValue(value === undefined ? [[]] : [[{ value }]])
    expect((await getBackupSettings()).include_access_logs).toBe(false)
  })
  it.each([true, false])('normalizes an explicit boolean %j', async include_access_logs => {
    mocks.queryDb.mockResolvedValue([[{ value: { include_access_logs } }]])
    expect((await getBackupSettings()).include_access_logs).toBe(include_access_logs)
  })
  it.each([true, false])('PUT saves boolean %j and preserves other fields', async include_access_logs => {
    mocks.queryDb.mockResolvedValue([[{ value: { max_backups: 4, default_excluded_tables: ['post'] } }]])
    mocks.readBody.mockResolvedValue({ include_access_logs })
    const { default: put } = await import('../../server/api/admin/backups/settings.put')
    const result = await put({} as H3Event)
    expect(result.settings).toMatchObject({ max_backups: 4, default_excluded_tables: ['post'], include_access_logs })
    expect(mocks.queryDb.mock.calls.at(-1)![2].value).toEqual(result.settings)
    expect(mocks.requireSuperadmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.readBody.mock.invocationCallOrder[0]!)
  })
  it('preserves opt-in when omitted from a settings update', async () => {
    mocks.queryDb.mockResolvedValue([[{ value: { include_access_logs: true } }]])
    mocks.readBody.mockResolvedValue({ max_backups: 3 })
    const { default: put } = await import('../../server/api/admin/backups/settings.put')
    expect((await put({} as H3Event)).settings.include_access_logs).toBe(true)
  })
  it.each(['true', 1, null, []])('rejects non-boolean %j before writing', async include_access_logs => {
    mocks.readBody.mockResolvedValue({ include_access_logs })
    const { default: put } = await import('../../server/api/admin/backups/settings.put')
    await expect(put({} as H3Event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })
  it('denies unauthorized updates before reading settings or body', async () => {
    mocks.requireSuperadmin.mockRejectedValue(new Error('Forbidden'))
    const { default: put } = await import('../../server/api/admin/backups/settings.put')
    await expect(put({} as H3Event)).rejects.toThrow('Forbidden')
    expect(mocks.readBody).not.toHaveBeenCalled()
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })
})
