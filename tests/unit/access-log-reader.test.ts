import { appendFile, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, symlink, unlink, utimes, writeFile } from 'node:fs/promises'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addAbortSignal, Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accessHourly, accessStats, createAccessLogReader, parseAccessLogLine, queryAccessLogs, readAccessLogById } from '../../server/utils/access-log-reader'
import type { AccessQuery } from '../../server/utils/access-log-reader'

let directory: string
let reader: ReturnType<typeof createAccessLogReader>
const now = new Date('2026-05-21T12:30:00Z')
const query: AccessQuery = { limit: 50, offset: 0, sort: 'newest', includeTotal: true }
const row = (ts: string, id: string, extra: Record<string, unknown> = {}) => JSON.stringify({ ts, id, m: 'GET', p: '/posts/hello', s: 200, d: 12, ...extra })
const put = (name: string, data: string | Buffer) => writeFile(join(directory, name), data)
const ids = (result: Awaited<ReturnType<typeof queryAccessLogs>>) => result.rows.map(row => row.request_id)
const openedFs = () => {
  const opened: string[] = []
  const handles: Awaited<ReturnType<typeof open>>[] = []
  const io = { ...fs, open: vi.fn(async (...args: Parameters<typeof open>) => {
    opened.push(String(args[0]))
    const handle = await open(...args)
    handles.push(handle)
    return handle
  }) }
  return { io, opened, handles }
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pandablog-access-reader-'))
  reader = createAccessLogReader({ dir: () => directory, now: () => now })
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

async function fixture() {
  await put('access-2026-05-20.ndjson.gz', gzipSync([
    row('2026-05-20T22:00:00Z', 'a'),
    row('2026-05-20T23:00:00Z', 'b', { m: 'POST', p: '/API/Login', s: 401, ua: 'Firefox' })
  ].join('\n') + '\n'))
  await put('access-2026-05-21.ndjson', [
    row('2026-05-21T00:00:00Z', 'c', { s: 500, ua: 'Mozilla/Chrome' }),
    row('2026-05-21T12:00:00Z', 'd', { m: 'POST', p: '/posts/other', s: 503 }),
    row('2026-05-21T13:00:00Z', 'future')
  ].join('\n') + '\n')
}

describe('access line to public API row mapping', () => {
  it('maps the short schema, normalizes UTC, scopes the ID, and ignores unknown fields', () => {
    expect(parseAccessLogLine(row('2026-05-21T02:00:00+02:00', 'uuid', {
      ip: '1.2.3.4', ua: 'Mozilla/你好', ref: 'https://example.org', q: { page: '2' }, secret: 'never expose'
    }), '2026-05-21')).toEqual({
      timestamp: '2026-05-21T00:00:00.000Z', id: '2026-05-21:uuid', method: 'GET', path: '/posts/hello',
      status_code: 200, response_time_ms: 12, ip: '1.2.3.4', user_agent: 'Mozilla/你好',
      request_id: 'uuid', query_params: { page: '2' }, referrer: 'https://example.org'
    })
  })

  it('uses null for missing or ill-shaped optional fields', () => {
    expect(parseAccessLogLine(row('2026-05-21T00:00:00Z', 'id', { ip: {}, ua: [], ref: 5, q: [] }), '2026-05-21'))
      .toMatchObject({ ip: null, user_agent: null, referrer: null, query_params: null })
  })

  it.each(['', '{', 'null', '[]', 'true', '{}',
    row('invalid', 'id'), row('2026-05-20T00:00:00Z', 'id'), row('2026-05-21T00:00:00Z', ''),
    row('2026-05-21T00:00:00Z', 'id', { m: null }), row('2026-05-21T00:00:00Z', 'id', { p: 1 }),
    row('2026-05-21T00:00:00Z', 'id', { s: '200' }), row('2026-05-21T00:00:00Z', 'id', { s: 600 }),
    row('2026-05-21T00:00:00Z', 'id', { d: -1 })])('skips malformed or invalid line %s', (line) => {
    expect(parseAccessLogLine(line, '2026-05-21')).toBeNull()
  })
})

describe('access queries', () => {
  it.each(['newest', 'oldest'] as const)('orders %s across plain/gzip days and pages matches', async (sort) => {
    await fixture()
    const result = await reader.queryAccessLogs({ ...query, sort, offset: 1, limit: 2 })
    expect(result).toMatchObject({ total: 4, limit: 2, offset: 1, sort, truncated: false })
    expect(ids(result)).toEqual(sort === 'newest' ? ['c', 'b'] : ['b', 'c'])
    expect(ids(await reader.queryAccessLogs({ ...query, sort, offset: 20 }))).toEqual([])
  })

  it.each([
    [{ path: '/posts/hello' }, ['c', 'a']],
    [{ method: ' post ' }, ['d', 'b']],
    [{ status: 401 }, ['b']],
    [{ min_status: 500 }, ['d', 'c']],
    [{ max_status: 401 }, ['b', 'a']],
    [{ min_status: 400, max_status: 500 }, ['c', 'b']],
    [{ search: 'aPi/LoGiN' }, ['b']],
    [{ search: 'CHROME' }, ['c']],
    [{ path: '/posts/hello', method: 'GET', status: 500, search: 'mozilla' }, ['c']],
    [{ search: 'no match' }, []]
  ] as Array<[Partial<AccessQuery>, string[]]>)('applies filter %j', async (filters, expected) => {
    await fixture()
    const result = await reader.queryAccessLogs({ ...query, ...filters })
    expect(ids(result)).toEqual(expected)
    expect(result.total).toBe(expected.length)
  })

  it('uses a rolling seven-day default and inclusive millisecond bounds with UTC day selection', async () => {
    await fixture()
    await put('access-2026-05-14.ndjson', [row('2026-05-14T12:29:59.999Z', 'old'), row('2026-05-14T12:30:00Z', 'boundary')].join('\n'))
    expect(ids(await reader.queryAccessLogs(query))).toEqual(['d', 'c', 'b', 'a', 'boundary'])
    const result = await reader.queryAccessLogs({ ...query, from: new Date('2026-05-21T02:00:00+02:00'), to: new Date('2026-05-21T12:00:00Z') })
    expect(ids(result)).toEqual(['d', 'c'])
    expect(await reader.queryAccessLogs({ ...query, from: now, to: new Date('2026-05-20') })).toMatchObject({ rows: [], total: 0, truncated: false })
  })

  it('skips invalid/blank lines and accepts CRLF and a final line without newline', async () => {
    await put('access-2026-05-21.ndjson', ['{broken', '', 'null', row('2026-05-21T00:00:00Z', 'valid')].join('\r\n'))
    expect(ids(await reader.queryAccessLogs(query))).toEqual(['valid'])
  })

  it.each(['newest', 'oldest'] as const)('early-exits %s without total, never opening other days, and closes the descriptor', async (sort) => {
    await fixture()
    const { io, opened, handles } = openedFs()
    reader = createAccessLogReader({ dir: () => directory, now: () => now, fs: io })
    const result = await reader.queryAccessLogs({ ...query, sort, includeTotal: false, offset: 1, limit: 1 })
    expect(ids(result)).toEqual(sort === 'newest' ? ['c'] : ['b'])
    expect(result.total).toBe(1)
    expect(opened).toHaveLength(1)
    expect(opened[0]).toContain(sort === 'newest' ? '2026-05-21.ndjson' : '2026-05-20.ndjson.gz')
    expect(handles.every(handle => handle.fd === -1)).toBe(true)
  })

  it.each(['newest', 'oldest'] as const)('returns a lower-bound total after a global line budget (%s)', async (sort) => {
    await fixture()
    reader = createAccessLogReader({ dir: () => directory, now: () => now, maxLines: 3 })
    const result = await reader.queryAccessLogs({ ...query, sort })
    expect(result.truncated).toBe(true)
    expect(result.total).toBe(sort === 'newest' ? 2 : 3)
    expect(ids(result)).toEqual(sort === 'newest' ? ['d', 'c'] : ['a', 'b', 'c'])
  })

  it('charges malformed and nonmatching lines to the line budget', async () => {
    await put('access-2026-05-21.ndjson', ['bad', row('2026-05-21T00:00:00Z', 'skip', { m: 'POST' }), row('2026-05-21T01:00:00Z', 'match')].join('\n'))
    reader = createAccessLogReader({ dir: () => directory, now: () => now, maxLines: 2 })
    expect(await reader.queryAccessLogs({ ...query, method: 'GET' })).toMatchObject({ rows: [], total: 0, truncated: true })
  })

  it('retains the newest matches when the per-day ring buffer cap is exceeded', async () => {
    await put('access-2026-05-21.ndjson', Array.from({ length: 5 }, (_, index) => row(`2026-05-21T0${index}:00:00Z`, String(index))).join('\n'))
    reader = createAccessLogReader({ dir: () => directory, now: () => now, maxMatchesPerFile: 2 })
    const result = await reader.queryAccessLogs(query)
    expect(result).toMatchObject({ total: 5, truncated: true })
    expect(ids(result)).toEqual(['4', '3'])
    expect(ids(await reader.queryAccessLogs({ ...query, sort: 'oldest' }))).toEqual(['0', '1', '2', '3', '4'])
  })

  it.each(['plain', 'gzip'] as const)('aborts stalled %s I/O at the deadline without mislabelling a prefix as newest, and closes streams/descriptors', async (kind) => {
    const name = `access-2026-05-21.ndjson${kind === 'gzip' ? '.gz' : ''}`
    const content = row('2026-05-21T00:00:00Z', 'partial') + '\n'
    await put(name, kind === 'gzip' ? gzipSync(content) : content)
    const handles: Awaited<ReturnType<typeof open>>[] = []
    const sources: Readable[] = []
    const io = { ...fs, open: async (...args: Parameters<typeof open>) => {
      const handle = await open(...args)
      handles.push(handle)
      handle.createReadStream = (options) => {
        const source = addAbortSignal(options!.signal!, new Readable({ read() {} }))
        sources.push(source)
        source.push(kind === 'gzip' ? gzipSync(content) : content)
        // No EOF: only the query deadline can end this scan.
        return source as ReturnType<typeof handle.createReadStream>
      }
      return handle
    } }
    reader = createAccessLogReader({ dir: () => directory, now: () => now, fs: io, maxDurationMs: 100 })
    const result = await reader.queryAccessLogs(query)
    expect(result).toMatchObject({ total: 1, truncated: true })
    expect(ids(result)).toEqual([])
    expect(sources.every(source => source.destroyed)).toBe(true)
    expect(handles.every(handle => handle.fd === -1)).toBe(true)
  })

  it('stops at the wall-time budget using a monotonic clock', async () => {
    await fixture()
    let ticks = 0
    reader = createAccessLogReader({ dir: () => directory, now: () => now, clock: () => ticks++ * 1000 })
    expect(await reader.queryAccessLogs(query)).toMatchObject({ total: 0, truncated: true })
  })

  it('prefers the plain source over a crash-leftover gzip for the same day', async () => {
    const content = row('2026-05-20T00:00:00Z', 'a') + '\n'
    await put('access-2026-05-20.ndjson.gz', gzipSync(content))
    await put('access-2026-05-20.ndjson', content + row('2026-05-20T01:00:00Z', 'b') + '\n')
    expect(ids(await reader.queryAccessLogs(query))).toEqual(['b', 'a'])
    const stats = await reader.accessStats()
    expect(stats.count).toBe(2)
    expect(stats.files).toBe(2) // Disk usage includes both physical representations.
    expect(stats.bytes).toBe((await lstat(join(directory, 'access-2026-05-20.ndjson'))).size + (await lstat(join(directory, 'access-2026-05-20.ndjson.gz'))).size)
  })

  it('recovers when compression replaces a listed plain file before it is opened', async () => {
    const name = 'access-2026-05-20.ndjson'
    await put(name, row('2026-05-20T00:00:00Z', 'a') + '\n')
    let stats = 0
    const io = { ...fs, lstat: vi.fn(async (...args: Parameters<typeof lstat>) => {
      if (String(args[0]) === join(directory, name) && ++stats === 2) {
        await put(`${name}.gz`, gzipSync(await readFile(join(directory, name))))
        await unlink(join(directory, name))
      }
      return lstat(...args)
    }) as typeof lstat }
    reader = createAccessLogReader({ dir: () => directory, now: () => now, fs: io })
    expect(ids(await reader.queryAccessLogs(query))).toEqual(['a'])
  })

  it('surfaces unreadable/corrupt archive errors instead of reporting a false complete result', async () => {
    await put('access-2026-05-20.ndjson.gz', 'not gzip')
    await expect(reader.queryAccessLogs(query)).rejects.toThrow()
    await expect(reader.accessStats()).rejects.toThrow()
    const io = { ...fs, opendir: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' })) }
    await expect(createAccessLogReader({ dir: () => directory, fs: io }).accessStats()).rejects.toThrow('denied')
  })

  it('validates date/pagination and injectable budgets', async () => {
    for (const override of [{ from: new Date('invalid') }, { limit: 0 }, { offset: -1 }, { limit: Infinity }, { offset: 1.1 }]) {
      await expect(reader.queryAccessLogs({ ...query, ...override })).rejects.toThrow('Invalid access log')
    }
    expect(() => createAccessLogReader({ maxLines: 0 })).toThrow('budget')
    expect(() => createAccessLogReader({ maxMatchesPerFile: 0 })).toThrow('budget')
    expect(() => createAccessLogReader({ maxDurationMs: NaN })).toThrow('duration')
  })
})

describe('detail and hourly reads', () => {
  it('addresses only the requested day, returns a public row, and closes on early exit', async () => {
    await fixture()
    const { io, opened, handles } = openedFs()
    reader = createAccessLogReader({ dir: () => directory, fs: io })
    expect(await reader.readAccessLogById('2026-05-20:b')).toMatchObject({ request_id: 'b', status_code: 401 })
    expect(opened).toEqual([join(directory, 'access-2026-05-20.ndjson.gz')])
    expect(handles[0]!.fd).toBe(-1)
    expect(await reader.readAccessLogById('2026-05-21:c')).toMatchObject({ request_id: 'c' })
  })

  it.each(['legacy-uuid', 'access_logs:legacy', '2026-02-30:a', '2026-05-20:', '../2026-05-20:a', '2026-05-19:a', '2026-05-20:missing'])('returns null (for API 404) for %s', async (id) => {
    await fixture()
    expect(await reader.readAccessLogById(id)).toBeNull()
  })

  it('zero-fills UTC hours across midnight and counts only 5xx as errors', async () => {
    await fixture()
    const buckets = await reader.accessHourly(24, now)
    expect(buckets).toHaveLength(24)
    expect(buckets[0]).toEqual({ hour: '2026-05-20T13:00:00.000Z', count: 0, errors: 0 })
    expect(buckets.at(-1)).toEqual({ hour: '2026-05-21T12:00:00.000Z', count: 1, errors: 1 })
    expect(buckets.find(bucket => bucket.hour === '2026-05-20T23:00:00.000Z')).toMatchObject({ count: 1, errors: 0 })
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4)
    expect(buckets.reduce((sum, bucket) => sum + bucket.errors, 0)).toBe(2)
    expect(await reader.accessHourly(1)).toEqual([{ hour: '2026-05-21T12:00:00.000Z', count: 1, errors: 1 }])
    const boundary = await reader.accessHourly(1, new Date('2026-05-21T02:00:00+02:00'))
    expect(boundary).toEqual([{ hour: '2026-05-21T00:00:00.000Z', count: 1, errors: 1 }])
    await expect(reader.accessHourly(0)).rejects.toThrow('hour')
    await expect(reader.accessHourly(1, new Date('invalid'))).rejects.toThrow('date')
  })
})

describe('stats and disposable count cache', () => {
  it('returns actual disk bytes/files and day-based bounds, caches closed gzip counts, and counts today live', async () => {
    await fixture()
    const { io, opened } = openedFs()
    reader = createAccessLogReader({ dir: () => directory, now: () => now, fs: io })
    const stats = await reader.accessStats()
    const bytes = (await lstat(join(directory, 'access-2026-05-20.ndjson.gz'))).size + (await lstat(join(directory, 'access-2026-05-21.ndjson'))).size
    expect(stats).toEqual({ count: 5, oldest: '2026-05-20T00:00:00.000Z', newest: '2026-05-21T00:00:00.000Z', bytes, files: 2 })
    const cache = JSON.parse(await readFile(join(directory, '.index.json'), 'utf8'))
    expect(cache['access-2026-05-20.ndjson.gz']).toMatchObject({ lines: 2, size: (await lstat(join(directory, 'access-2026-05-20.ndjson.gz'))).size })
    expect(Object.keys(cache)).toEqual(['access-2026-05-20.ndjson.gz', 'access-2026-05-21.ndjson'])
    opened.length = 0
    await appendFile(join(directory, 'access-2026-05-21.ndjson'), row('2026-05-21T12:15:00Z', 'live') + '\n')
    expect((await reader.accessStats()).count).toBe(6)
    expect(opened.some(path => path.endsWith('.gz'))).toBe(false)
    expect(opened.some(path => path.endsWith('.ndjson'))).toBe(true)
    // A fresh reader reuses the disk cache, not just in-memory state.
    opened.length = 0
    await createAccessLogReader({ dir: () => directory, now: () => now, fs: io }).accessStats()
    expect(opened.some(path => path.endsWith('.gz'))).toBe(false)
  })

  it('invalidates gzip counts on size or mtime change, and removes stale cache keys', async () => {
    await fixture()
    await reader.accessStats()
    await put('access-2026-05-20.ndjson.gz', gzipSync(row('2026-05-20T00:00:00Z', 'replacement') + '\n'))
    expect((await reader.accessStats()).count).toBe(4)
    const { io, opened } = openedFs()
    await utimes(join(directory, 'access-2026-05-20.ndjson.gz'), new Date('2026-05-22'), new Date('2026-05-22'))
    await createAccessLogReader({ dir: () => directory, now: () => now, fs: io }).accessStats()
    expect(opened.some(path => path.endsWith('.gz'))).toBe(true)
    await unlink(join(directory, 'access-2026-05-20.ndjson.gz'))
    expect((await reader.accessStats()).count).toBe(3)
    expect(Object.keys(JSON.parse(await readFile(join(directory, '.index.json'), 'utf8')))).toEqual(['access-2026-05-21.ndjson'])
  })

  it.each(['{broken', '[]', 'null', '{"access-2026-05-20.ndjson.gz":{"size":1,"mtimeMs":1,"lines":-1}}'])('rebuilds invalid cache %s', async (cache) => {
    await fixture()
    await put('.index.json', cache)
    expect((await reader.accessStats()).count).toBe(5)
  })

  it('ignores cache persistence errors and cleans up its temporary file', async () => {
    await fixture()
    const io = { ...fs, rename: vi.fn().mockRejectedValue(new Error('read only')) }
    expect((await createAccessLogReader({ dir: () => directory, now: () => now, fs: io }).accessStats()).count).toBe(5)
    expect((await readdir(directory)).some(name => name.endsWith('.tmp'))).toBe(false)
  })

  it('counts physical lines, including malformed lines, and safely checkpoints plain and gzip files', async () => {
    await put('access-2026-05-20.ndjson', 'bad\n\npartial')
    await put('access-2026-05-21.ndjson.gz', gzipSync('bad\n'))
    expect((await reader.accessStats()).count).toBe(4)
    expect(Object.keys(JSON.parse(await readFile(join(directory, '.index.json'), 'utf8')))).toHaveLength(2)
  })

  it('does not publish a cache entry when an archive changes during its count', async () => {
    await fixture()
    let stats = 0
    const io = { ...fs, lstat: vi.fn(async (...args: Parameters<typeof lstat>) => {
      if (String(args[0]).endsWith('.gz') && ++stats === 3) {
        await utimes(String(args[0]), new Date('2026-06-01'), new Date('2026-06-01'))
      }
      return lstat(...args)
    }) as typeof lstat }
    await expect(createAccessLogReader({ dir: () => directory, now: () => now, fs: io }).accessStats()).rejects.toMatchObject({statusCode: 503})
    expect(JSON.parse(await readFile(join(directory, '.index.json'), 'utf8'))).toEqual({})
  })
})

describe('filesystem isolation and public wrappers', () => {
  it('honors ACCESS_LOG_DIR through all public wrappers', async () => {
    await fixture()
    vi.stubEnv('ACCESS_LOG_DIR', directory)
    expect(ids(await queryAccessLogs({ ...query, from: new Date('2026-05-20'), to: now }))).toEqual(['d', 'c', 'b', 'a'])
    expect(await readAccessLogById('2026-05-20:b')).toMatchObject({ request_id: 'b' })
    expect((await accessStats()).count).toBe(5)
    expect((await accessHourly(24, now)).reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4)
  })

  it('ignores unknown names, impossible dates, and directories; missing storage is a read-only no-op', async () => {
    for (const name of ['.index.json', 'notes', 'access-2026-02-30.ndjson', 'access-2026-05-1.ndjson', 'access-2026-05-20.ndjson.migrating', 'access-2026-05-20.ndjson.gz.tmp']) await put(name, 'bad\n')
    await mkdir(join(directory, 'access-2026-05-20.ndjson'))
    expect(await reader.accessStats()).toEqual({ count: 0, oldest: null, newest: null, bytes: 0, files: 0 })
    reader = createAccessLogReader({ dir: () => join(directory, 'missing'), now: () => now })
    expect(await reader.queryAccessLogs(query)).toMatchObject({ rows: [], total: 0, truncated: false })
    expect(await reader.accessStats()).toMatchObject({ count: 0, files: 0 })
    expect((await reader.accessHourly()).every(bucket => bucket.count === 0)).toBe(true)
    expect(await reader.readAccessLogById('2026-05-20:id')).toBeNull()
    expect(await readdir(directory)).not.toContain('missing')
  })

  it.for(['file', 'directory', 'cache'])('does not follow %s symlinks', async (kind, context) => {
    const target = join(directory, 'target')
    if (kind !== 'directory') await writeFile(target, kind === 'cache' ? '{"secret":true}' : row('2026-05-20T00:00:00Z', 'secret') + '\n')
    const link = join(directory, kind === 'directory' ? 'linked-dir' : kind === 'cache' ? '.index.json' : 'access-2026-05-20.ndjson')
    try { await symlink(kind === 'directory' ? directory : target, link, kind === 'directory' ? 'junction' : 'file') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') { context.skip(); return }
      throw error
    }
    if (kind === 'directory') {
      await put('.index.json', '{"cached-file":{"size":1,"mtimeMs":1,"lines":1}}')
      reader = createAccessLogReader({ dir: () => link, now: () => now })
    }
    if (kind === 'cache') await fixture()
    expect((await reader.accessStats()).count).toBe(kind === 'cache' ? 5 : 0)
    expect(ids(await reader.queryAccessLogs(query))).not.toContain('secret')
    expect((await lstat(link)).isSymbolicLink()).toBe(true)
    if (kind !== 'directory') expect(await readFile(target, 'utf8')).toContain('secret')
    else expect(await readFile(join(directory, '.index.json'), 'utf8')).toBe('{"cached-file":{"size":1,"mtimeMs":1,"lines":1}}')
  })
})
