import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { DateTime, RecordId } from 'surrealdb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCESS_EXPORTED_KEY, ACCESS_MIGRATION_KEY, mergeMigrationDay, migrateAccessLogs, migrationCursor, migrationEntry, verifyAccessMigrationReceipt } from '../../server/utils/access-log-migration'
import type { AccessMigrationOptions } from '../../server/utils/access-log-migration'
import { createAccessLogStore, serializeAccessLog } from '../../server/utils/access-log-store'

const failure = vi.hoisted(() => ({ stage: '' }))
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>()
  return {
    ...fs,
    open: async (...args: Parameters<typeof fs.open>) => {
      const file = await fs.open(...args)
      if (String(args[0]).endsWith('.migrating')) {
        if (failure.stage === 'sync') file.sync = async () => { throw new Error('injected sync failure') }
        if (failure.stage === 'write') file.writeFile = async () => { throw new Error('injected write failure') }
        if (failure.stage === 'changed') {
          const write = file.writeFile.bind(file)
          file.writeFile = async (...data) => {
            if (failure.stage === 'changed') {
              failure.stage = ''
              await fs.appendFile(String(args[0]).slice(0, -10), JSON.stringify({ ts: '2026-05-20T09:30:00.000Z', id: 'other', m: 'GET', p: '/other', s: 200, d: 1 }) + '\n')
            }
            return write(...data)
          }
        }
      }
      return file
    },
    rename: async (...args: Parameters<typeof fs.rename>) => {
      if (failure.stage === 'rename' && String(args[0]).endsWith('.migrating')) throw new Error('injected rename failure')
      return fs.rename(...args)
    },
    unlink: async (...args: Parameters<typeof fs.unlink>) => {
      if (failure.stage === 'unlink' && String(args[0]).endsWith('.ndjson.gz')) throw new Error('injected unlink failure')
      return fs.unlink(...args)
    }
  }
})
vi.mock('../../server/utils/db', () => ({ queryDb: vi.fn() }))
const now = new Date('2026-05-20T10:00:00Z')
const settings = { retention_access_days: 30, redact_fields: ['password', 'token', 'authorization', 'cookie'], max_metadata_size_kb: 50 }
const row = (id: string, timestamp = '2026-05-20T01:00:00Z', extra: Record<string, unknown> = {}) => ({
  id: `access_logs:${id}`, timestamp, request_id: id, method: 'GET', path: `/posts/${id}`, status_code: 200, response_time_ms: 12, ...extra
})
let root: string
let dir: string
let legacyDir: string
let markers: Map<string, unknown>
let options: AccessMigrationOptions
let source: Record<string, unknown>[]
let store: ReturnType<typeof createAccessLogStore>
beforeEach(async () => {
  failure.stage = ''
  root = await mkdtemp(join(tmpdir(), 'pb-access-migrate-'))
  dir = join(root, 'access')
  legacyDir = join(root, 'legacy')
  await mkdir(legacyDir)
  markers = new Map()
  source = []
  store = createAccessLogStore({ dir: () => dir, now: () => now })
  options = {
    dir, legacyDir, now, settings, getMarker: vi.fn(async key => structuredClone(markers.get(key))),
    setMarker: vi.fn(async (key, value) => { markers.set(key, structuredClone(value)) }),
    tableExists: vi.fn(async () => true),
    loadPage: vi.fn(async (_cutoff, cursor) => {
      const start = cursor ? source.findIndex(value => value.id === cursor.id) + 1 : 0
      return source.slice(start, start + 5000)
    }),
    exclusive: store.exclusive, maintain: () => store.maintain(now, settings.retention_access_days), progress: vi.fn()
  }
})
afterEach(async () => {
  failure.stage = ''
  await store.close()
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function dayRows(day = '2026-05-20') {
  const names = await readdir(dir)
  const name = `access-${day}.ndjson`
  const content = names.includes(name) ? await readFile(join(dir, name), 'utf8')
    : gunzipSync(await readFile(join(dir, `${name}.gz`))).toString()
  return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}
const entry = (id: string, timestamp?: string) => migrationEntry(row(id, timestamp), settings)

describe('migration mapping and cursor', () => {
  it('normalizes SDK dates/record IDs to a stable UTC cursor and compact line', () => {
    const value = row('one', '2026-05-19T23:00:00-04:00', {
      id: new RecordId('access_logs', 'one'), timestamp: new DateTime('2026-05-20T03:00:00Z'),
      ip: null, user_agent: 'Browser', query_params: { token: 'secret', page: '2', nested: { password: 'secret' } }
    })
    expect(migrationCursor(value)).toEqual({ timestamp: '2026-05-20T03:00:00.000Z', id: 'access_logs:one' })
    const mapped = JSON.parse(serializeAccessLog(migrationEntry(value, settings)))
    expect(mapped).toMatchObject({ ts: '2026-05-20T03:00:00.000Z', id: 'one', m: 'GET', p: '/posts/one', s: 200, d: 12, ua: 'Browser' })
    expect(mapped).not.toHaveProperty('ip')
    expect(mapped.q.page).toBe('2')
    expect(JSON.stringify(mapped)).not.toContain('secret')
  })
  it('provides deterministic missing-request-ID fallbacks across SDK/string DB IDs and buffer retries', () => {
    const a = row('one', undefined, { request_id: null })
    const b = { ...a, id: new RecordId('access_logs', 'one') }
    expect(migrationEntry(a, settings).request_id).toBe(migrationEntry(b, settings).request_id)
    const buffer = { ...a, id: undefined }
    expect(migrationEntry(buffer, settings).request_id).toBe(migrationEntry({ ...buffer }, settings).request_id)
  })
  it.each([{ timestamp: 'bad' }, { method: null }, { path: 1 }, { status_code: '200' }, { response_time_ms: 1.5 }])('halts rather than silently discarding invalid legacy rows %j', extra => {
    expect(() => migrationEntry(row('one', undefined, extra), settings)).toThrow('Invalid legacy')
  })
  it('retains nanosecond cursor precision and numeric record-ID types', () => {
    const value = row('one', undefined, { id: new RecordId('access_logs', 123), timestamp: new DateTime('2026-05-20T03:00:00.123456789Z') })
    expect(migrationCursor(value)).toEqual({ timestamp: '2026-05-20T03:00:00.123456789Z', id: 'access_logs:123', numericId: '123' })
  })
  it('bounds query metadata without truncating required top-level entry fields', () => {
    const mapped = migrationEntry(row('one', undefined, { query_params: { large: 'x'.repeat(100_000) } }), { ...settings, max_metadata_size_kb: 1 })
    expect(mapped.method).toBe('GET')
    expect(Buffer.byteLength(JSON.stringify(mapped.query_params))).toBeLessThan(1200)
  })
})

describe('streamed publication and recovery', () => {
  it('preserves live rows, prepends historical rows and keeps successive same-day pages chronological', async () => {
    store.append(entry('live', '2026-05-20T09:00:00Z'))
    await store.exclusive(d => mergeMigrationDay(d, [entry('first')]))
    await store.exclusive(d => mergeMigrationDay(d, [entry('second', '2026-05-20T02:00:00Z')]))
    expect((await dayRows()).map(value => value.id)).toEqual(['first', 'second', 'live'])
  })
  it('replays published pages without duplicates, including changed/redacted content', async () => {
    await mergeMigrationDay(dir, [entry('one'), entry('one'), entry('two', '2026-05-20T02:00:00Z')])
    await mergeMigrationDay(dir, [{ ...entry('one'), path: '/redacted' }])
    expect((await dayRows()).map(value => value.id)).toEqual(['one', 'two'])
    expect((await dayRows())[0].p).toBe('/redacted')
    expect(await readdir(dir)).not.toContain('access-2026-05-20.ndjson.migrating')
  })
  it('merges an existing gzip instead of overwriting its traffic and recovers a stale temp', async () => {
    await mkdir(dir)
    await writeFile(join(dir, 'access-2026-05-19.ndjson.gz'), gzipSync(serializeAccessLog(entry('live', '2026-05-19T09:00:00Z')) + '\n'))
    await writeFile(join(dir, 'access-2026-05-19.ndjson.migrating'), 'partial garbage')
    await mergeMigrationDay(dir, [entry('old', '2026-05-19T01:00:00Z')])
    expect((await dayRows('2026-05-19')).map(value => value.id)).toEqual(['old', 'live'])
    expect(await readdir(dir)).toEqual(['access-2026-05-19.ndjson'])
  })
  it('uses plain as authoritative when gzip and plain coexist after publication', async () => {
    await mkdir(dir)
    await writeFile(join(dir, 'access-2026-05-20.ndjson'), serializeAccessLog(entry('live')) + '\nmalformed\n')
    await writeFile(join(dir, 'access-2026-05-20.ndjson.gz'), gzipSync('stale\n'))
    await mergeMigrationDay(dir, [entry('one')])
    expect(await readFile(join(dir, 'access-2026-05-20.ndjson'), 'utf8')).toContain('malformed\n')
    expect(await readdir(dir)).toEqual(['access-2026-05-20.ndjson'])
  })
  it('preserves corrupt gzip/source data and withholds publication', async () => {
    await mkdir(dir)
    const path = join(dir, 'access-2026-05-19.ndjson.gz')
    await writeFile(path, 'not gzip')
    await expect(mergeMigrationDay(dir, [entry('one', '2026-05-19T01:00:00Z')])).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('not gzip')
    expect(await readdir(dir)).toEqual(['access-2026-05-19.ndjson.gz'])
  })
  it.each(['write', 'sync', 'rename'])('retains originals and removes an unpublished temp after %s failure', async stage => {
    await mergeMigrationDay(dir, [entry('live', '2026-05-20T09:00:00Z')])
    const path = join(dir, 'access-2026-05-20.ndjson')
    const original = await readFile(path, 'utf8')
    failure.stage = stage
    await expect(mergeMigrationDay(dir, [entry('one')])).rejects.toThrow(`injected ${stage}`)
    expect(await readFile(path, 'utf8')).toBe(original)
    expect(await readdir(dir)).not.toContain('access-2026-05-20.ndjson.migrating')
    failure.stage = ''
    await mergeMigrationDay(dir, [entry('one')])
    expect((await dayRows()).map(value => value.id)).toEqual(['one', 'live'])
  })
  it('recovers a crash after plain publication but before archive unlink without losing rows', async () => {
    await mkdir(dir)
    await writeFile(join(dir, 'access-2026-05-20.ndjson.gz'), gzipSync(serializeAccessLog(entry('live', '2026-05-20T09:00:00Z')) + '\n'))
    failure.stage = 'unlink'
    await expect(mergeMigrationDay(dir, [entry('one')])).rejects.toThrow('injected unlink')
    expect((await dayRows()).map(value => value.id)).toEqual(['one', 'live'])
    failure.stage = ''
    await mergeMigrationDay(dir, [entry('one')])
    expect((await dayRows()).map(value => value.id)).toEqual(['one', 'live'])
    expect(await readdir(dir)).toEqual(['access-2026-05-20.ndjson'])
  })
  it('detects an external append rather than atomically replacing a changed source', async () => {
    await mergeMigrationDay(dir, [entry('live', '2026-05-20T09:00:00Z')])
    failure.stage = 'changed'
    await expect(mergeMigrationDay(dir, [entry('one')])).rejects.toThrow('source changed')
    expect((await dayRows()).map(value => value.id)).toEqual(['live', 'other'])
    await mergeMigrationDay(dir, [entry('one')])
    expect((await dayRows()).map(value => value.id)).toEqual(['one', 'live', 'other'])
  })
  it('queues concurrent requests during merge and shutdown and drains them after publication', async () => {
    store.append(entry('before', '2026-05-20T09:00:00Z'))
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const mutation = store.exclusive(async (d) => { await gate; await mergeMigrationDay(d, [entry('old')]) })
    store.append(entry('during', '2026-05-20T09:01:00Z'))
    const close = store.close()
    release()
    await mutation
    await close
    expect((await dayRows()).map(value => value.id)).toEqual(['old', 'before', 'during'])
    await expect(store.exclusive(async () => {})).rejects.toThrow('closed')
  })
  it('serializes migration with purge/retention and replays requests after failure', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const order: string[] = []
    const first = store.exclusive(async () => { await gate; order.push('first'); throw new Error('failure') })
    store.append(entry('during'))
    const second = store.exclusive(async () => { order.push('second') })
    release()
    await expect(first).rejects.toThrow('failure')
    await second
    expect(order).toEqual(['first', 'second'])
    expect((await dayRows())[0].id).toBe('during')
  })
})

describe('checkpointed export and legacy buffer drain', () => {
  it('exports 5001 tied-timestamp rows without OFFSET, checkpoints after publication, then compresses past days', async () => {
    source = Array.from({ length: 5001 }, (_, index) => row(`id-${String(index).padStart(5, '0')}`, '2026-05-19T01:00:00Z'))
    await migrateAccessLogs(options)
    expect(options.loadPage).toHaveBeenCalledTimes(3)
    expect(vi.mocked(options.loadPage).mock.calls[1]![1]).toEqual({ timestamp: '2026-05-19T01:00:00.000Z', id: 'access_logs:id-04999' })
    expect((await dayRows('2026-05-19'))).toHaveLength(5001)
    expect(await readdir(dir)).toContain('access-2026-05-19.ndjson.gz')
    expect(markers.get(ACCESS_MIGRATION_KEY)).toMatchObject({ total: 5001 })
    await verifyAccessMigrationReceipt(markers.get(ACCESS_EXPORTED_KEY), dir)
    await migrateAccessLogs(options)
    expect(options.loadPage).toHaveBeenCalledTimes(3)
  })
  it('recovers publication-before-checkpoint failures without duplicate lines', async () => {
    source = [row('one'), row('two')]
    vi.mocked(options.setMarker).mockImplementationOnce(async (key, value) => { markers.set(key, structuredClone(value)) })
      .mockRejectedValueOnce(new Error('checkpoint failure'))
    await expect(migrateAccessLogs(options)).rejects.toThrow('checkpoint failure')
    expect((await dayRows())).toHaveLength(2)
    expect(markers.has(ACCESS_EXPORTED_KEY)).toBe(false)
    await migrateAccessLogs(options)
    expect((await dayRows())).toHaveLength(2)
    expect(markers.get(ACCESS_MIGRATION_KEY)).toMatchObject({ total: 2 })
  })
  it('does not advance the cursor when file publication fails and succeeds on retry', async () => {
    source = [row('one')]
    const exclusive = options.exclusive
    options.exclusive = vi.fn(async () => { throw new Error('disk unavailable') })
    await expect(migrateAccessLogs(options)).rejects.toThrow('disk unavailable')
    expect(markers.get(ACCESS_MIGRATION_KEY)).not.toHaveProperty('cursor')
    expect(markers.has(ACCESS_EXPORTED_KEY)).toBe(false)
    options.exclusive = exclusive
    await migrateAccessLogs(options)
    expect((await dayRows())).toHaveLength(1)
  })
  it('keeps a fixed cutoff across restarts, skips expired rows and rejects a nonadvancing cursor', async () => {
    source = [row('expired', '2026-04-20T09:59:59Z'), row('cutoff', '2026-04-20T10:00:00Z')]
    await migrateAccessLogs(options)
    expect((await dayRows('2026-04-20')).map(value => value.id)).toEqual(['cutoff'])
    expect(vi.mocked(options.loadPage).mock.calls[0]![0]).toBe('2026-04-20T10:00:00.000Z')
    markers.delete(ACCESS_EXPORTED_KEY)
    options.now = new Date('2026-05-21T10:00:00Z')
    options.loadPage = vi.fn(async () => [source[1]!])
    await expect(migrateAccessLogs(options)).rejects.toThrow('cursor did not advance')
    expect(vi.mocked(options.loadPage).mock.calls[0]![0]).toBe('2026-04-20T10:00:00.000Z')
  })
  it('drains legacy plain/flushing buffers, dedupes DB request IDs and preserves unrelated files', async () => {
    source = [row('db')]
    await writeFile(join(legacyDir, 'access-buffer.ndjson'), [row('db'), row('buffer'), row('expired', '2020-01-01T00:00:00Z')].map(value => JSON.stringify(value)).join('\n'))
    await writeFile(join(legacyDir, 'access-buffer.ndjson.123.flushing'), JSON.stringify(row('flushing')) + '\n')
    await writeFile(join(legacyDir, 'notes.flushing'), 'keep')
    await writeFile(join(legacyDir, 'access-buffer.ndjson.invalid.flushing'), 'keep')
    await migrateAccessLogs(options)
    expect((await dayRows()).map(value => value.id).sort()).toEqual(['buffer', 'db', 'flushing'])
    expect(await readdir(legacyDir)).toEqual(['access-buffer.ndjson.invalid.flushing', 'notes.flushing'])
    expect(markers.has(ACCESS_EXPORTED_KEY)).toBe(true)
  })
  it('retains malformed buffers and withholds completion after partial commits; retries dedupe', async () => {
    const path = join(legacyDir, 'access-buffer.ndjson')
    const rows = Array.from({ length: 5000 }, (_, index) => row(`id-${index}`)).map(value => JSON.stringify(value)).join('\n')
    await writeFile(path, `${rows}\ninvalid`)
    await expect(migrateAccessLogs(options)).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toContain('invalid')
    expect((await dayRows())).toHaveLength(5000)
    expect(markers.has(ACCESS_EXPORTED_KEY)).toBe(false)
    await writeFile(path, rows + '\n')
    await migrateAccessLogs(options)
    expect((await dayRows())).toHaveLength(5000)
  })
  it('does not expose malformed buffer content in diagnostics', async () => {
    await writeFile(join(legacyDir, 'access-buffer.ndjson'), '{"token":"synthetic-secret",broken')
    await expect(migrateAccessLogs(options)).rejects.toThrow('Invalid legacy access buffer JSON; source retained')
    try { await migrateAccessLogs(options) } catch (error) { expect(String(error)).not.toContain('synthetic-secret') }
    expect(markers.has(ACCESS_EXPORTED_KEY)).toBe(false)
  })
  it('drains buffers even when the table is absent (fresh/default-excluded backup)', async () => {
    options.tableExists = vi.fn(async () => false)
    await writeFile(join(legacyDir, 'access-buffer.ndjson'), JSON.stringify(row('one')))
    await migrateAccessLogs(options)
    expect(options.loadPage).not.toHaveBeenCalled()
    expect((await dayRows())).toHaveLength(1)
    await verifyAccessMigrationReceipt(markers.get(ACCESS_EXPORTED_KEY), dir)
  })
  it('creates a valid empty receipt for a fresh installation', async () => {
    options.tableExists = vi.fn(async () => false)
    await migrateAccessLogs(options)
    expect(markers.get(ACCESS_EXPORTED_KEY)).toMatchObject({ dir, days: [] })
    await verifyAccessMigrationReceipt(markers.get(ACCESS_EXPORTED_KEY), dir)
  })
  it('safely retries a failure after receipt publication but before the exported DB marker', async () => {
    source = [row('one')]
    const save = options.setMarker
    options.setMarker = async (key, value) => {
      if (key === ACCESS_EXPORTED_KEY) throw new Error('export marker failure')
      await save(key, value)
    }
    await expect(migrateAccessLogs(options)).rejects.toThrow('export marker failure')
    expect(await readdir(dir)).toContain('.migration-v1.json')
    expect(markers.has(ACCESS_EXPORTED_KEY)).toBe(false)
    options.setMarker = save
    await migrateAccessLogs(options)
    expect((await dayRows())).toHaveLength(1)
    const receipt = markers.get(ACCESS_EXPORTED_KEY) as { token: string; dir: string; days: string[]; counts: Record<string, number> }
    // SurrealDB sorts object fields; receipt verification must be semantic.
    await verifyAccessMigrationReceipt({ counts: receipt.counts, days: receipt.days, dir: receipt.dir, token: receipt.token }, dir)
  })
  it('withholds the export marker after maintenance failure and safely retries published rows', async () => {
    source = [row('one')]
    options.maintain = vi.fn().mockRejectedValueOnce(new Error('gzip failed')).mockResolvedValueOnce({})
    await expect(migrateAccessLogs(options)).rejects.toThrow('gzip failed')
    expect(markers.has(ACCESS_EXPORTED_KEY)).toBe(false)
    await migrateAccessLogs(options)
    expect((await dayRows())).toHaveLength(1)
    expect(markers.has(ACCESS_EXPORTED_KEY)).toBe(true)
  })
  it('rejects a changed directory/checkpoint and lost export storage', async () => {
    source = [row('one')]
    await migrateAccessLogs(options)
    await expect(verifyAccessMigrationReceipt(markers.get(ACCESS_EXPORTED_KEY), legacyDir)).rejects.toThrow('does not match')
    await rm(join(dir, 'access-2026-05-20.ndjson'))
    await expect(verifyAccessMigrationReceipt(markers.get(ACCESS_EXPORTED_KEY), dir)).rejects.toThrow('day missing')
    markers.delete(ACCESS_EXPORTED_KEY)
    options.dir = legacyDir
    await expect(migrateAccessLogs(options)).rejects.toThrow('checkpoint/storage')
  })
  it('halts a resumed cursor when already-checkpointed files are missing or truncated', async () => {
    source = [row('one'), row('two')]
    options.maintain = vi.fn().mockRejectedValue(new Error('interrupted before completion'))
    await expect(migrateAccessLogs(options)).rejects.toThrow('interrupted')
    const path = join(dir, 'access-2026-05-20.ndjson')
    await writeFile(path, serializeAccessLog(entry('one')) + '\n')
    await expect(migrateAccessLogs(options)).rejects.toThrow('truncated')
    await rm(path)
    await expect(migrateAccessLogs(options)).rejects.toThrow('day missing')
    expect(markers.has(ACCESS_EXPORTED_KEY)).toBe(false)
  })
  it('refuses removal of a present but truncated export day', async () => {
    source = [row('one'), row('two')]
    await migrateAccessLogs(options)
    await writeFile(join(dir, 'access-2026-05-20.ndjson'), '')
    await expect(verifyAccessMigrationReceipt(markers.get(ACCESS_EXPORTED_KEY), dir)).rejects.toThrow('truncated')
  })
  it('refuses table-removal receipts altered independently of the DB', async () => {
    await migrateAccessLogs(options)
    await writeFile(join(dir, '.migration-v1.json'), '{}')
    await expect(verifyAccessMigrationReceipt(markers.get(ACCESS_EXPORTED_KEY), dir)).rejects.toThrow('mismatch')
  })
  it('reports progress at each 50K threshold', async () => {
    markers.set(ACCESS_MIGRATION_KEY, { dir, cutoff: '2026-04-20T10:00:00.000Z', total: 49_999, days: [], counts: {} })
    source = [row('one')]
    await migrateAccessLogs(options)
    expect(options.progress).toHaveBeenCalledExactlyOnceWith(50_000)
  })
})

describe('symlink safety', () => {
  it('rejects an access directory junction without touching external files', async () => {
    const external = join(root, 'outside')
    await mkdir(external)
    await writeFile(join(external, 'keep'), 'safe')
    await symlink(external, dir, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(mergeMigrationDay(dir, [entry('one')])).rejects.toThrow('directory')
    expect(await readdir(external)).toEqual(['keep'])
  })
  it.for(['access-2026-05-20.ndjson', 'access-2026-05-20.ndjson.gz', 'access-2026-05-20.ndjson.migrating'])('rejects %s file symlinks', async (name, context) => {
    await mkdir(dir)
    const external = join(root, 'outside')
    await writeFile(external, 'safe')
    try { await symlink(external, join(dir, name), 'file') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') { context.skip(); return }
      throw error
    }
    await expect(mergeMigrationDay(dir, [entry('one')])).rejects.toThrow('Unsafe')
    expect(await readFile(external, 'utf8')).toBe('safe')
  })
})
