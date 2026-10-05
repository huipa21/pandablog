import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFullBackupSelection } from '../../server/utils/backups/selection'
import { exportSurrealDb } from '../../server/utils/backups/surrealHttp'

const all = ['access_logs', 'activity_logs', 'error_logs', 'post', 'app_settings']
afterEach(() => vi.unstubAllGlobals())

describe('full backup selection', () => {
  it('excludes only access logs, preserving audit/diagnostic and application tables', () => {
    expect(buildFullBackupSelection(all, false)).toEqual({ tables: all.slice(1) })
    expect(all[0]).toBe('access_logs')
  })
  it('returns the old unrestricted export on opt-in', () => {
    expect(buildFullBackupSelection(all, true)).toBeUndefined()
  })
  it('does not restrict databases without access logs (including disabled logs)', () => {
    expect(buildFullBackupSelection(all.slice(1), false)).toBeUndefined()
    expect(buildFullBackupSelection([], false)).toBeUndefined()
  })
  it('returns an explicitly empty selection if access_logs is the only table', () => {
    expect(buildFullBackupSelection(['access_logs'], false)).toEqual({ tables: [] })
  })
})

describe('HTTP export selection', () => {
  it.each([undefined, { tables: all.slice(1) }, { tables: [] }])('serializes %j without broadening an empty selection', async selection => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      surrealUrl: 'ws://localhost:8000/rpc', surrealRoot: 'root', surrealRootPassword: 'test',
      surrealNamespace: 'fixture', surrealDatabase: 'fixture'
    }))
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: Readable.toWeb(Readable.from('dump')) })
    vi.stubGlobal('fetch', fetchMock)
    const stream = await exportSurrealDb(selection)
    stream.resume()
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
    expect(body.tables).toEqual(selection?.tables ?? true)
    expect(body).toMatchObject({ records: true, users: true, analyzers: true })
  })
})
