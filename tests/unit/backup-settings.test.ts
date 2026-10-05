import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBackupSettings } from '../../server/utils/settings'

const mocks = vi.hoisted(() => ({ queryDb: vi.fn(), useDb: vi.fn(), requireSuperadmin: vi.fn(), readBody: vi.fn() }))
vi.mock('../../server/utils/db', () => mocks)
vi.mock('../../server/utils/auth', () => ({ requireSuperadmin: mocks.requireSuperadmin }))
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

describe('backup settings after access file migration', () => {
  it.each([undefined, null, 'invalid', {}, { include_access_logs: true }, { include_access_logs: false }])('omits the retired field from legacy settings %j', async value => {
    mocks.queryDb.mockResolvedValue(value === undefined ? [[]] : [[{ value }]])
    expect(await getBackupSettings()).toEqual({ max_backups: 10, validate_before_restore: true, auto_safety_snapshot: true, default_excluded_tables: [] })
  })
  it.each([true, false, 'true', 1, null, []])('treats a retired request field (%j) as a no-op and removes stored legacy values on save', async include_access_logs => {
    mocks.queryDb.mockResolvedValue([[{ value: { max_backups: 4, default_excluded_tables: ['post'], include_access_logs: true } }]])
    mocks.readBody.mockResolvedValue({ include_access_logs })
    const { default: put } = await import('../../server/api/admin/backups/settings.put')
    const result = await put({} as H3Event)
    expect(result.settings).toMatchObject({ max_backups: 4, default_excluded_tables: ['post'] })
    expect(result.settings).not.toHaveProperty('include_access_logs')
    expect(mocks.queryDb.mock.calls.at(-1)![2].value).toEqual(result.settings)
    expect(mocks.requireSuperadmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.readBody.mock.invocationCallOrder[0]!)
  })
  it('continues to validate supported settings before writing', async () => {
    mocks.readBody.mockResolvedValue({ max_backups: -1 })
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
