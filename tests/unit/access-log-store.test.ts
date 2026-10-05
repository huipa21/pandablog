import { createWriteStream } from 'node:fs'
import type { WriteStream } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { accessLogDir, createAccessLogStore, fileNameForDate, serializeAccessLog } from '../../server/utils/access-log-store'
import type { AccessLogEntry } from '../../types/logging'

const entry: AccessLogEntry = { method: 'GET', path: '/posts/hello', status_code: 200, response_time_ms: 12, request_id: 'request-123' }
let directory: string
const stores: ReturnType<typeof createAccessLogStore>[] = []
const streams: HeldStream[] = []

// A real Writable with controllable IO completion, including genuine writableLength/backpressure.
class HeldStream extends Writable {
  chunks: string[] = []
  callbacks: Array<(error?: Error | null) => void> = []
  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(chunk.toString())
    this.callbacks.push(callback)
  }

  release() {
    while (this.callbacks.length) this.callbacks.shift()!()
  }
}

function held() {
  const stream = new HeldStream()
  streams.push(stream)
  return stream as unknown as WriteStream
}

function store(options: Parameters<typeof createAccessLogStore>[0] = {}) {
  const result = createAccessLogStore({ dir: () => directory, ...options })
  stores.push(result)
  return result
}

async function tick() {
  await new Promise<void>(resolve => setImmediate(resolve))
}

async function rows(name: string) {
  const content = await readFile(join(directory, name), 'utf8')
  expect(content.endsWith('\n')).toBe(true)
  return content.trimEnd().split('\n').map(line => JSON.parse(line))
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pandablog-access-store-'))
})
afterEach(async () => {
  for (const stream of streams) { stream.release(); stream.destroy() }
  await Promise.all(stores.map(store => store.close()))
  stores.length = 0
  streams.length = 0
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('access file naming and serialization', () => {
  it('resolves default, relative and absolute ACCESS_LOG_DIR from cwd', () => {
    vi.stubEnv('ACCESS_LOG_DIR', '')
    expect(accessLogDir()).toBe(resolve(process.cwd(), 'storage/logs/access'))
    vi.stubEnv('ACCESS_LOG_DIR', 'custom/access')
    expect(accessLogDir()).toBe(resolve(process.cwd(), 'custom/access'))
    vi.stubEnv('ACCESS_LOG_DIR', directory)
    expect(accessLogDir()).toBe(directory)
  })

  it.each([
    ['2026-05-20T23:59:59.999Z', 'access-2026-05-20.ndjson'],
    ['2026-05-21T00:00:00.000Z', 'access-2026-05-21.ndjson'],
    ['2026-05-21T01:00:00+08:00', 'access-2026-05-20.ndjson'],
    ['2027-01-01T00:00:00Z', 'access-2027-01-01.ndjson']
  ])('names %s in UTC', (date, name) => {
    expect(fileNameForDate(new Date(date))).toBe(name)
  })

  it('uses only the short-key schema, preserving optional values and escaping newlines', () => {
    const line = serializeAccessLog({ ...entry, timestamp: '2026-05-20T18:00:00+08:00', ip: '1.2.3.4', user_agent: 'Browser\nUA', referrer: 'https://example.test', query_params: { page: '2', token: '[REDACTED]' } })
    expect(line).not.toContain('\n')
    expect(JSON.parse(line)).toEqual({
      ts: '2026-05-20T10:00:00.000Z', id: 'request-123', m: 'GET', p: '/posts/hello', s: 200, d: 12,
      ip: '1.2.3.4', ua: 'Browser\nUA', ref: 'https://example.test', q: { page: '2', token: '[REDACTED]' }
    })
  })

  it('omits null optional fields/empty query and generates a UUID if the request ID is missing', () => {
    const now = new Date('2026-05-20T10:00:00.123Z')
    const row = JSON.parse(serializeAccessLog({ ...entry, request_id: null, ip: null, user_agent: null, referrer: null, query_params: {} }, now))
    expect(row).toEqual({ ts: now.toISOString(), id: expect.stringMatching(/^[0-9a-f-]{36}$/), m: 'GET', p: '/posts/hello', s: 200, d: 12 })
    expect(JSON.parse(serializeAccessLog({ ...entry, timestamp: 'invalid' }, now)).ts).toBe(now.toISOString())
  })
})

describe('access file writer', () => {
  it('exposes the singleton append/close API and honors ACCESS_LOG_DIR without creating a legacy buffer', async () => {
    vi.resetModules()
    vi.stubEnv('ACCESS_LOG_DIR', directory)
    const api = await import('../../server/utils/access-log-store')
    try {
      expect(() => api.appendAccessLog({ ...entry, timestamp: '2026-05-20T10:00:00Z' })).not.toThrow()
    } finally {
      await api.closeAccessLogStore()
    }
    expect(await readdir(directory)).toEqual(['access-2026-05-20.ndjson'])
    expect((await rows('access-2026-05-20.ndjson')).map(row => row.id)).toEqual(['request-123'])
  })

  it('sends asynchronous file failures as one warning through the structured console sink', async () => {
    vi.resetModules()
    vi.stubEnv('LOG_CONSOLE', 'errors')
    vi.stubEnv('LOG_FORMAT', 'json')
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { createAccessLogStore: create } = await import('../../server/utils/access-log-store')
    await writeFile(join(directory, 'not-a-directory'), 'fixture')
    const writer = create({ dir: () => join(directory, 'not-a-directory'), mkdir: () => {} })
    writer.append(entry)
    await writer.close()
    expect(stderr).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(stderr.mock.calls[0]![0]))).toMatchObject({ level: 'warn', kind: 'app', msg: expect.stringContaining('write failed') })
  })

  it('creates nested directories lazily, keeps one stream, appends in order, and closes/flushed descriptors', async () => {
    const target = join(directory, 'nested', 'access')
    const opened: WriteStream[] = []
    const open = vi.fn((path: string) => {
      const stream = createWriteStream(path, { flags: 'a' })
      opened.push(stream)
      return stream
    })
    const writer = store({ dir: () => target, now: () => new Date('2026-05-20T10:00:00Z'), open })
    expect(await readdir(directory)).toEqual([])
    for (let index = 0; index < 100; index++) writer.append({ ...entry, request_id: String(index) })
    const closing = writer.close()
    expect(writer.close()).toBe(closing)
    await closing
    expect(open).toHaveBeenCalledTimes(1)
    expect(opened[0]?.closed).toBe(true)
    const content = await readFile(join(target, 'access-2026-05-20.ndjson'), 'utf8')
    expect(content.endsWith('\n')).toBe(true)
    expect(content.trimEnd().split('\n').map(line => JSON.parse(line).id)).toEqual(Array.from({ length: 100 }, (_, index) => String(index)))
    writer.append(entry)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('preserves existing day-file content instead of overwriting it', async () => {
    const name = 'access-2026-05-20.ndjson'
    await writeFile(join(directory, name), `${serializeAccessLog({ ...entry, request_id: 'old' }, new Date('2026-05-20T00:00:00Z'))}\n`)
    const writer = store({ now: () => new Date('2026-05-20T10:00:00Z') })
    writer.append(entry)
    await writer.close()
    expect((await rows(name)).map(row => row.id)).toEqual(['old', 'request-123'])
  })

  it('rotates at UTC midnight, flushing both days even when close immediately follows rotation', async () => {
    let now = new Date('2026-05-20T23:59:59.999Z')
    const writer = store({ now: () => now })
    writer.append({ ...entry, request_id: 'before' })
    now = new Date('2026-05-21T00:00:00.000Z')
    writer.append({ ...entry, request_id: 'after' })
    await writer.close()
    expect((await readdir(directory)).sort()).toEqual(['access-2026-05-20.ndjson', 'access-2026-05-21.ndjson'])
    expect(await rows('access-2026-05-20.ndjson')).toEqual([expect.objectContaining({ ts: '2026-05-20T23:59:59.999Z', id: 'before' })])
    expect(await rows('access-2026-05-21.ndjson')).toEqual([expect.objectContaining({ ts: '2026-05-21T00:00:00.000Z', id: 'after' })])
  })

  it('buckets explicit timestamps by UTC day and falls back to the injected clock for invalid dates', async () => {
    const writer = store({ now: () => new Date('2026-05-21T12:00:00Z') })
    writer.append({ ...entry, timestamp: '2026-05-21T01:00:00+08:00' })
    writer.append({ ...entry, timestamp: 'invalid' })
    await writer.close()
    expect((await readdir(directory)).sort()).toEqual(['access-2026-05-20.ndjson', 'access-2026-05-21.ndjson'])
  })

  it('waits for the old stream as well as the current stream at shutdown', async () => {
    let now = new Date('2026-05-20T23:59:59Z')
    const writer = store({ now: () => now, open: held })
    writer.append(entry)
    now = new Date('2026-05-21T00:00:00Z')
    writer.append(entry)
    let closed = false
    const closing = writer.close().then(() => { closed = true })
    streams[1]!.release()
    await tick()
    expect(closed).toBe(false)
    streams[0]!.release()
    await closing
    expect(streams.every(stream => stream.closed)).toBe(true)
  })

  it('handles a real asynchronous fs open error without throwing or rejecting shutdown', async () => {
    await writeFile(join(directory, 'not-a-directory'), 'fixture')
    const warn = vi.fn()
    const writer = store({ dir: () => join(directory, 'not-a-directory'), mkdir: () => {}, warn })
    expect(() => writer.append(entry)).not.toThrow()
    await writer.close()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('write failed'), expect.any(Object))
  })

  it.each(['mkdir', 'open', 'write'] as const)('swallows synchronous %s failures and diagnostic failures', async (operation) => {
    const fail = () => { throw new Error('fixture failure') }
    const warn = vi.fn(fail)
    const stream = held()
    if (operation === 'write') vi.spyOn(stream, 'write').mockImplementation(fail)
    const writer = store({ mkdir: operation === 'mkdir' ? fail : undefined, open: operation === 'open' ? fail : () => stream, warn })
    expect(() => writer.append(entry)).not.toThrow()
    await expect(writer.close()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('drops malformed/unserializable entries without destroying previously queued valid data', async () => {
    const warn = vi.fn()
    const writer = store({ now: () => new Date('2026-05-20T10:00:00Z'), warn })
    writer.append(entry)
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => writer.append({ ...entry, query_params: circular })).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
    await writer.close()
    expect((await rows('access-2026-05-20.ndjson')).map(row => row.id)).toEqual(['request-123'])
  })

  it('retries the first failure on the next append, backs off repeated failures for 60s and recovers', async () => {
    let time = Date.parse('2026-05-20T10:00:00Z')
    const open = vi.fn(held)
    const warn = vi.fn()
    const writer = store({ now: () => new Date(time), open, warn })
    writer.append(entry)
    streams[0]!.destroy(new Error('first'))
    await tick()
    writer.append(entry)
    expect(open).toHaveBeenCalledTimes(2)
    streams[1]!.destroy(new Error('second'))
    await tick()
    for (let index = 0; index < 10; index++) writer.append(entry)
    time += 59_999
    writer.append(entry)
    expect(open).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
    time += 1
    writer.append(entry)
    expect(open).toHaveBeenCalledTimes(3)
    streams[2]!.release()
    await tick()
    streams[2]!.destroy(new Error('after successful write'))
    await tick()
    writer.append(entry)
    expect(open).toHaveBeenCalledTimes(4)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('does not throw while inspecting an exotic failure value', async () => {
    const error = new Error()
    Object.defineProperty(error, 'message', { get() { throw new Error('unsafe getter') } })
    const warn = vi.fn()
    const writer = store({ open: () => { throw error }, warn })
    expect(() => writer.append(entry)).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('write failed'), { error: 'Unknown error', backoff_ms: 0 })
  })

  it('also backs off repeated synchronous open failures', async () => {
    let time = Date.parse('2026-05-20T10:00:00Z')
    const open = vi.fn(() => { throw new Error('permission denied') })
    const writer = store({ now: () => new Date(time), open, warn: vi.fn() })
    for (let index = 0; index < 20; index++) writer.append(entry)
    expect(open).toHaveBeenCalledTimes(2)
    time += 60_000
    writer.append(entry)
    expect(open).toHaveBeenCalledTimes(3)
  })

  it('does not discard a new stream when a previously rotated stream fails', async () => {
    let now = new Date('2026-05-20T23:59:59Z')
    const open = vi.fn(held)
    const writer = store({ now: () => now, open, warn: vi.fn() })
    writer.append(entry)
    now = new Date('2026-05-21T00:00:00Z')
    writer.append(entry)
    streams[0]!.destroy(new Error('old stream failed'))
    await tick()
    writer.append({ ...entry, request_id: 'still-current' })
    expect(open).toHaveBeenCalledTimes(2)
    streams[1]!.release()
    await writer.close()
    expect(streams[1]!.chunks.map(chunk => JSON.parse(chunk).id)).toEqual(['request-123', 'still-current'])
  })

  it('bounds queued bytes at 8MiB, counts drops, rate limits warnings and resumes after drain', async () => {
    let time = Date.parse('2026-05-20T10:00:00Z')
    const warn = vi.fn()
    const writer = store({ now: () => new Date(time), open: held, warn })
    const largeEntry = { ...entry, user_agent: 'x'.repeat(1024 * 1024) }
    for (let index = 0; index < 7; index++) writer.append(largeEntry)
    expect(streams[0]!.writableLength).toBeGreaterThan(7 * 1024 * 1024)
    writer.append(largeEntry)
    writer.append(largeEntry)
    writer.append(largeEntry)
    expect(streams[0]!.writableLength).toBeLessThanOrEqual(8 * 1024 * 1024)
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('dropping entries'), { dropped: 1 })
    time += 60_000
    writer.append(largeEntry)
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('dropping entries'), { dropped: 3 })
    streams[0]!.release()
    writer.append({ ...entry, request_id: 'after-drain' })
    streams[0]!.release()
    await writer.close()
    expect(streams[0]!.chunks).toHaveLength(8)
    expect(JSON.parse(streams[0]!.chunks[7]!).id).toBe('after-drain')
  })

  it('drops a single entry larger than the entire queue budget', async () => {
    const warn = vi.fn()
    const writer = store({ open: held, warn })
    writer.append({ ...entry, user_agent: 'x'.repeat(8 * 1024 * 1024) })
    expect(streams[0]!.writableLength).toBe(0)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
