import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createApp, createError, createRouter, defineEventHandler, getQuery, getRequestURL, getRouterParams, readBody, sendStream, setHeader, toNodeListener } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireSuperadmin: vi.fn(), useDb: vi.fn(), queryDb: vi.fn(), queryDbRecord: vi.fn() }))
vi.mock('../../server/utils/auth', () => ({ requireSuperadmin: mocks.requireSuperadmin }))
vi.mock('../../server/utils/db', () => mocks)
let server: Server
let base: string
let directory: string
let modules: Record<string, unknown>
const day = new Date().toISOString().slice(0, 10)
const previousDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
const line = (date: string, id: string, extra: Record<string, unknown> = {}) => `${JSON.stringify({ ts: `${date}T00:00:00.000Z`, id, m: 'GET', p: `/posts/${id}`, s: 200, d: 12, ...extra })}\n`

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  modules = {}
  directory = await mkdtemp(join(tmpdir(), 'pandablog-access-api-'))
  vi.stubEnv('ACCESS_LOG_DIR', directory)
  vi.stubEnv('LOG_CONSOLE', 'off')
  for (const [name, value] of Object.entries({ createError, defineEventHandler, getQuery, getRequestURL, getRouterParams, readBody, sendStream, setHeader })) vi.stubGlobal(name, value)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules } }))
  mocks.requireSuperadmin.mockResolvedValue({ role: 'superadmin' })
  mocks.useDb.mockResolvedValue({})
  mocks.queryDb.mockResolvedValue([])
  await writeFile(join(directory, `access-${previousDay}.ndjson.gz`), gzipSync(line(previousDay, 'old')))
  await writeFile(join(directory, `access-${day}.ndjson`), line(day, 'first', { ua: 'Test Browser', s: 503 }) + line(day, 'second', { m: 'POST', s: 201 }))
  const router = createRouter()
  router.get('/api/admin/logs/access', (await import('../../server/api/admin/logs/access.get')).default)
  router.get('/api/admin/logs/access/:id', (await import('../../server/api/admin/logs/access/[id].get')).default)
  router.get('/api/admin/logs/access/export', (await import('../../server/api/admin/logs/access/export.get')).default)
  router.get('/api/admin/logs/access/hourly', (await import('../../server/api/admin/logs/access/hourly.get')).default)
  router.get('/api/admin/logs/activity', (await import('../../server/api/admin/logs/activity.get')).default)
  router.get('/api/admin/logs/errors', (await import('../../server/api/admin/logs/errors.get')).default)
  router.get('/api/admin/logs/:type/export', (await import('../../server/api/admin/logs/[type]/export.get')).default)
  router.get('/api/admin/logs/:type/:id', (await import('../../server/api/admin/logs/[type]/[id].get')).default)
  router.get('/api/admin/logs/stats', (await import('../../server/api/admin/logs/stats.get')).default)
  router.delete('/api/admin/logs/:type', (await import('../../server/api/admin/logs/[type].delete')).default)
  router.post('/api/admin/logs/cleanup', (await import('../../server/api/admin/logs/cleanup.post')).default)
  const app = createApp().use(router)
  server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  await (await import('../../server/utils/access-log-store')).closeAccessLogStore()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
const json = async (path: string) => (await fetch(`${base}/api/admin/logs/${path}`)).json()
const cleanup = (body: unknown) => fetch(`${base}/api/admin/logs/cleanup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('file-backed admin APIs over real H3 HTTP', () => {
  it('lists plain/gzip files, normalizes all filters and preserves paging/total controls', async () => {
    expect(await json('access?limit=1&offset=1&sort=oldest')).toMatchObject({ rows: [{ id: `${day}:first` }], total: 3, limit: 1, offset: 1, sort: 'oldest', truncated: false })
    const query = new URLSearchParams({ from: `${day}T00:00:00Z`, to: `${day}T23:59:59Z`, method: ' get ', path: '/posts/first', status: '503', min_status: '500', max_status: '599', search: 'TEST\nBROWSER', total: 'false' })
    expect(await json(`access?${query}`)).toMatchObject({ rows: [{ id: `${day}:first`, status_code: 503, user_agent: 'Test Browser' }], total: 1, truncated: false })
    expect((await json('access?from=invalid&to=invalid&status=no&limit=invalid&offset=-1&sort=bad')).rows).toHaveLength(3)
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it('routes hourly ahead of detail and returns all 24 UTC buckets, not a 200-row sample', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-21T00:30:00.000Z'))
    const previous = '2026-05-20'
    const current = '2026-05-21'
    const pastRows = Array.from({ length: 450 }, (_, index) => line(previous, `busy-${index}`, { ts: `${previous}T23:15:00.000Z`, s: index < 15 ? 503 : 200 })).join('')
    await writeFile(join(directory, `access-${previous}.ndjson.gz`), gzipSync(
      line(previous, 'outside', { ts: `${previous}T00:59:59.999Z` }) +
      line(previous, 'start', { ts: `${previous}T01:00:00.000Z` }) + pastRows + 'malformed\n'
    ))
    await writeFile(join(directory, `access-${current}.ndjson`),
      line(current, 'client-error', { s: 404 }) +
      line(current, 'server-error', { ts: `${current}T00:30:00.000Z`, s: 500 }) +
      line(current, 'future', { ts: `${current}T00:30:00.001Z`, s: 503 })
    )
    const reader = await import('../../server/utils/access-log-reader')
    const detail = vi.spyOn(reader, 'readAccessLogById')
    const list = vi.spyOn(reader, 'queryAccessLogs')
    const buckets = await json('access/hourly')
    expect(buckets).toHaveLength(24)
    expect(buckets[0]).toEqual({ hour: `${previous}T01:00:00.000Z`, count: 1, errors: 0 })
    expect(buckets[1]).toEqual({ hour: `${previous}T02:00:00.000Z`, count: 0, errors: 0 })
    expect(buckets[22]).toEqual({ hour: `${previous}T23:00:00.000Z`, count: 450, errors: 15 })
    expect(buckets[23]).toEqual({ hour: `${current}T00:00:00.000Z`, count: 2, errors: 1 })
    expect(buckets.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0)).toBe(453)
    expect(detail).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it('zero-fills hourly for missing storage and refreshes newly appended traffic', async () => {
    await rm(directory, { recursive: true })
    const empty = await json('access/hourly')
    expect(empty).toHaveLength(24)
    expect(empty.every((bucket: { count: number; errors: number }) => bucket.count === 0 && bucket.errors === 0)).toBe(true)
    // Recreate only disposable storage; the endpoint must not cache old counts.
    const { mkdir } = await import('node:fs/promises')
    await mkdir(directory)
    const timestamp = new Date().toISOString()
    await writeFile(join(directory, `access-${timestamp.slice(0, 10)}.ndjson`), line(timestamp.slice(0, 10), 'fresh', { ts: timestamp }))
    const refreshed = await json('access/hourly')
    expect(refreshed.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0)).toBe(1)
  })

  it.each([{ logs: { enabled: false } }, { logs: { accessLogs: false } }])('gates hourly before reading files when modules are disabled (%j)', async (disabled) => {
    modules = disabled
    const reader = await import('../../server/utils/access-log-reader')
    const hourly = vi.spyOn(reader, 'accessHourly')
    const response = await fetch(`${base}/api/admin/logs/access/hourly`)
    expect(response.status).toBe(404)
    await response.text()
    expect(hourly).not.toHaveBeenCalled()
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it('returns 503 rather than false detail 404 or exact hourly/stats zero when native file scans exhaust their budget', async () => {
    const reader = await import('../../server/utils/access-log-reader')
    const bounded = reader.createAccessLogReader({dir: () => directory, maxScanBytes: 10})
    vi.spyOn(reader, 'readAccessLogById').mockImplementation(bounded.readAccessLogById)
    vi.spyOn(reader, 'accessHourly').mockImplementation(bounded.accessHourly)
    vi.spyOn(reader, 'accessStats').mockImplementation(bounded.accessStats)
    for (const path of [`access/${encodeURIComponent(`${day}:missing`)}`, 'access/hourly', 'stats']) {
      const response = await fetch(`${base}/api/admin/logs/${path}`)
      expect(response.status).toBe(503); await response.text()
    }
    expect(mocks.queryDb).not.toHaveBeenCalled()
  })

  it('preserves truncated scan lower bounds in lists and streamed exports', async () => {
    const reader = await import('../../server/utils/access-log-reader')
    vi.spyOn(reader, 'queryAccessLogs').mockImplementation(async query => ({ rows: [{ id: `${day}:partial` }], total: 123, limit: query.limit, offset: query.offset, sort: query.sort, truncated: true }))
    expect(await json('access')).toMatchObject({ total: 123, truncated: true })
    expect(await json('access/export')).toMatchObject({ exported: 1, truncated: true, rows: [{ id: `${day}:partial` }] })
    const csv = await fetch(`${base}/api/admin/logs/access/export?format=csv`)
    expect(csv.headers.get('x-log-truncated')).toBe('true')
    expect(await csv.text()).toContain(`${day}:partial`)
  })

  it('maps query parameters compatibly without letting malformed values override reader defaults', async () => {
    const { toAccessQuery } = await import('../../server/utils/logging-admin')
    const pagination = { limit: 10, offset: 20, sort: 'oldest' as const, includeTotal: false }
    expect(toAccessQuery({ from: '2026-05-20T08:00:00+08:00', to: '2026-05-21', path: ' /posts ', method: ' post ', status: '201', min_status: '200', max_status: '299', search: ' TEST\nBrowser ' }, pagination)).toEqual({
      ...pagination, from: new Date('2026-05-20T00:00:00Z'), to: new Date('2026-05-21T00:00:00Z'), path: '/posts', method: 'POST', status: 201, min_status: 200, max_status: 299, search: 'TEST Browser'
    })
    expect(toAccessQuery({ from: 'invalid', to: ['2026-05-21'], path: ['bad'], method: '  ', status: 'NaN', min_status: '1.5', max_status: 'Infinity', search: ['bad'] }, pagination)).toEqual({ ...pagination, from: undefined, to: undefined, path: undefined, method: undefined, status: undefined, min_status: undefined, max_status: undefined, search: undefined })
  })

  it('reads a date-prefixed ID and returns 404 for legacy/missing/path-like IDs', async () => {
    expect(await json(`access/${encodeURIComponent(`${day}:first`)}`)).toMatchObject({ record: { id: `${day}:first`, request_id: 'first' } })
    for (const id of ['access_logs:first', `${day}:missing`, '../outside']) {
      const response = await fetch(`${base}/api/admin/logs/access/${encodeURIComponent(id)}`)
      expect(response.status).toBe(404)
      await response.text()
    }
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it('exports streamed JSON/CSV beyond list limits, capped at 10K and honoring filters', async () => {
    await writeFile(join(directory, `access-${day}.ndjson`), Array.from({ length: 10_005 }, (_, index) => line(day, String(index), { p: '/"你好,\npost"' })).join(''))
    const result = await json('access/export?limit=99999&sort=oldest')
    expect(result).toMatchObject({ type: 'access', exported: 10_000, truncated: false })
    expect(result.rows).toHaveLength(10_000)
    expect(result.rows[0].request_id).toBe('old')
    const response = await fetch(`${base}/api/admin/logs/access/export?format=csv&limit=2&from=${day}T00:00:00Z&sort=oldest`)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('access-logs.csv')
    const csv = await response.text()
    expect(csv).toContain('"/""你好,\npost"""')
    expect(csv).toContain(`"${day}:0"`)
    expect(csv).toContain(`"${day}:1"`)
    expect(csv).not.toContain(`"${day}:2"`)
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it('exports empty results as valid JSON and empty CSV', async () => {
    expect(await json('access/export?path=/missing')).toEqual({ type: 'access', exported: 0, truncated: false, rows: [] })
    expect(await (await fetch(`${base}/api/admin/logs/access/export?format=csv&path=/missing`)).text()).toBe('')
  })

  it('returns actual file stats and DB estimates excluding access', async () => {
    mocks.queryDb.mockResolvedValue([[{ total: 2 }], [{ total: 3 }]])
    const result = await json('stats')
    expect(result.access).toMatchObject({ count: 3, files: 2, oldest: `${previousDay}T00:00:00.000Z`, newest: `${day}T00:00:00.000Z` })
    expect(result.access_files_bytes).toBe(result.access.bytes)
    expect(result.db_estimate_bytes).toBe(5400)
    expect(result).not.toHaveProperty('estimate_bytes')
    expect(mocks.queryDb.mock.calls[0]![1]).not.toContain('access_logs')
  })

  it('purges files with confirmation and returns line counts without deleting unrelated files', async () => {
    await writeFile(join(directory, 'notes.txt'), 'keep me')
    const response = await fetch(`${base}/api/admin/logs/access`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm_token: 'PURGE_ACCESS' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, deleted: 3 })
    expect(await readdir(directory)).toEqual(['notes.txt'])
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it('rejects keep-latest and deletes only whole expired days for access cleanup', async () => {
    const rejected = await cleanup({ type: 'access', mode: 'keep_latest', value: 10 })
    expect(rejected.status).toBe(400)
    expect(await rejected.text()).toContain('older_than_days')
    expect(mocks.useDb).not.toHaveBeenCalled()
    await writeFile(join(directory, 'access-2000-01-01.ndjson'), line('2000-01-01', 'expired'))
    const response = await cleanup({ type: 'access', mode: 'older_than_days', value: 1 })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, result: { type: 'access', mode: 'older_than_days', value: 1, deleted: 1 } })
    expect(await readdir(directory)).not.toContain('access-2000-01-01.ndjson')
    expect(await readFile(join(directory, `access-${day}.ndjson`), 'utf8')).toContain('first')
    expect(mocks.queryDb.mock.calls.every(call => !String(call[1]).includes('access_logs'))).toBe(true)
  })

  it.each(['activity', 'errors'])('retains the DB list for %s', async (type) => {
    mocks.queryDb.mockResolvedValue([[{ id: 'db-row' }], [{ total: 12 }]])
    expect(await json(`${type}?limit=3`)).toEqual({ rows: [{ id: 'db-row' }], total: 12, limit: 3, offset: 0, sort: 'newest' })
    expect(mocks.queryDb).toHaveBeenCalledOnce()
  })

  it.each([401, 403])('authorizes every access route before file/DB work (%s)', async (statusCode) => {
    mocks.requireSuperadmin.mockRejectedValue(createError({ statusCode, message: 'Denied' }))
    const hourly = vi.spyOn(await import('../../server/utils/access-log-reader'), 'accessHourly')
    for (const path of ['access', `access/${day}:first`, 'access/export', 'access/hourly', 'stats']) {
      const response = await fetch(`${base}/api/admin/logs/${path}`)
      expect(response.status).toBe(statusCode)
      await response.text()
    }
    const purge = await fetch(`${base}/api/admin/logs/access`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm_token: 'PURGE_ACCESS' }) })
    expect(purge.status).toBe(statusCode)
    await purge.text()
    const response = await cleanup({ type: 'access', mode: 'older_than_days', value: 1 })
    expect(response.status).toBe(statusCode)
    await response.text()
    expect(mocks.useDb).not.toHaveBeenCalled()
    expect(hourly).not.toHaveBeenCalled()
    expect(await readdir(directory)).toHaveLength(2)
  })

  it('gates disabled access list/detail/export/cleanup before I/O', async () => {
    modules = { logs: { accessLogs: false } }
    for (const path of ['access', `access/${day}:first`, 'access/export', 'access/hourly']) {
      const response = await fetch(`${base}/api/admin/logs/${path}`)
      expect(response.status).toBe(404)
      await response.text()
    }
    const purge = await fetch(`${base}/api/admin/logs/access`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm_token: 'PURGE_ACCESS' }) })
    expect(purge.status).toBe(404)
    await purge.text()
    const response = await cleanup({ type: 'access', mode: 'older_than_days', value: 1 })
    expect(response.status).toBe(404)
    await response.text()
    expect(mocks.useDb).not.toHaveBeenCalled()
    expect(await readdir(directory)).toHaveLength(2)
    const stats = await json('stats')
    expect(stats.access).toEqual({ count: 0, oldest: null, newest: null, files: 0, bytes: 0 })
    expect(await readdir(directory)).toHaveLength(2) // Disabled stats must not create the cache.
  })
})
