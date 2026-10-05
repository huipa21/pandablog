import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccessLogStore, maintainAccessLogFiles } from '../../server/utils/access-log-store'

const failure = vi.hoisted(() => ({ stage: '' }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...fs,
    open: async (...args: Parameters<typeof fs.open>) => {
      const handle = await fs.open(...args)
      if (failure.stage === 'sync' && String(args[0]).endsWith('.gz.tmp')) {
        handle.sync = async () => { throw new Error('injected fsync failure') }
      }
      if (failure.stage === 'append' && String(args[0]).endsWith('.gz.tmp')) {
        const write = handle.writeFile.bind(handle)
        handle.writeFile = async (...data) => {
          if (failure.stage === 'append') {
            failure.stage = ''
            await fs.appendFile(String(args[0]).slice(0, -7), 'late row\n')
          }
          return write(...data)
        }
      }
      return handle
    },
    rename: async (...args: Parameters<typeof fs.rename>) => {
      if (failure.stage === 'rename') throw new Error('injected rename failure')
      return fs.rename(...args)
    },
    unlink: async (...args: Parameters<typeof fs.unlink>) => {
      if (failure.stage === 'unlink' && String(args[0]).endsWith('.ndjson')) throw new Error('injected unlink failure')
      return fs.unlink(...args)
    }
  }
})

let directory: string
let writer: ReturnType<typeof createAccessLogStore>
const now = new Date('2026-05-21T00:05:00Z')
const yesterday = 'access-2026-05-20.ndjson'
const content = '{"ts":"2026-05-20T23:59:59.000Z","id":"request","p":"/你好"}\n'.repeat(10_000)

beforeEach(async () => {
  failure.stage = ''
  directory = await mkdtemp(join(tmpdir(), 'pandablog-access-maintenance-'))
  writer = createAccessLogStore({ dir: () => directory })
})
afterEach(async () => {
  failure.stage = ''
  await writer.close()
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})
const put = (name: string, data: string | Buffer = content) => writeFile(join(directory, name), data)
const files = async () => (await readdir(directory)).sort()
const compressedContent = async (name = yesterday) => gunzipSync(await readFile(join(directory, `${name}.gz`))).toString()

describe('access file compression and recovery', () => {
  it('streams past days to gzip, preserves bytes and leaves today/future untouched; repeat runs are no-ops', async () => {
    await put(yesterday)
    await put('access-2026-05-21.ndjson')
    await put('access-2026-05-22.ndjson')
    expect(await writer.maintain(now, 30)).toEqual({ compressed: 1, deleted: 0 })
    expect(await compressedContent()).toBe(content)
    expect(await files()).toEqual([`${yesterday}.gz`, 'access-2026-05-21.ndjson', 'access-2026-05-22.ndjson'])
    expect(await writer.maintain(now, 30)).toEqual({ compressed: 0, deleted: 0 })
  })

  it('exposes the singleton API and honors ACCESS_LOG_DIR', async () => {
    vi.stubEnv('ACCESS_LOG_DIR', directory)
    await put(yesterday)
    expect(await maintainAccessLogFiles(now, 30)).toEqual({ compressed: 1, deleted: 0 })
    expect(await compressedContent()).toBe(content)
  })

  it.each(['valid', 'corrupt', 'truncated', 'stale'] as const)('recovers a %s gzip beside a plain file', async (kind) => {
    await put(yesterday)
    const gzip = gzipSync(content)
    const data = kind === 'corrupt' ? Buffer.from('not gzip') : kind === 'truncated' ? gzip.subarray(0, gzip.length - 5) : kind === 'stale' ? gzipSync('old rows\n') : gzip
    await put(`${yesterday}.gz`, data)
    await put(`${yesterday}.gz.tmp`, 'interrupted compression')
    expect(await writer.maintain(now, 30)).toEqual({ compressed: 1, deleted: 0 })
    expect(await compressedContent()).toBe(content)
    expect(await files()).toEqual([`${yesterday}.gz`])
  })

  it('discards a stale temporary file and retries compression', async () => {
    await put(yesterday)
    await put(`${yesterday}.gz.tmp`, 'incomplete')
    await writer.maintain(now, 30)
    expect(await compressedContent()).toBe(content)
    expect(await files()).toEqual([`${yesterday}.gz`])
  })

  it.each(['sync', 'rename', 'unlink'])('preserves source after %s failure, continues other files and recovers on the next run', async (stage) => {
    await put(yesterday)
    await put('access-2026-01-01.ndjson')
    failure.stage = stage
    await expect(writer.maintain(now, 30)).rejects.toThrow(`injected ${stage === 'sync' ? 'fsync' : stage} failure`)
    expect(await readFile(join(directory, yesterday), 'utf8')).toBe(content)
    // Expired files are deleted even when another day's compression fails.
    if (stage !== 'unlink') expect(await files()).not.toContain('access-2026-01-01.ndjson')
    failure.stage = ''
    await writer.maintain(now, 30)
    expect(await compressedContent()).toBe(content)
    expect(await files()).toEqual([`${yesterday}.gz`])
  })

  it('keeps the plain source if it changes during compression and retries without losing late rows', async () => {
    await put(yesterday)
    failure.stage = 'append'
    await expect(writer.maintain(now, 30)).rejects.toThrow('source changed during compression')
    expect(await readFile(join(directory, yesterday), 'utf8')).toBe(`${content}late row\n`)
    expect(await files()).toEqual([yesterday])
    expect(await writer.maintain(now, 30)).toEqual({ compressed: 1, deleted: 0 })
    expect(await compressedContent()).toBe(`${content}late row\n`)
  })

  it('drains an idle past-day writer before compression and permits today to keep writing', async () => {
    let clock = new Date('2026-05-20T23:59:59Z')
    await writer.close()
    writer = createAccessLogStore({ dir: () => directory, now: () => clock })
    const row = { method: 'GET', path: '/test', status_code: 200, response_time_ms: 1 }
    for (let index = 0; index < 1000; index++) writer.append({ ...row, request_id: String(index) })
    clock = now
    const first = writer.maintain(now, 30)
    expect(writer.maintain(now, 1)).toBe(first)
    writer.append({ ...row, request_id: 'today' })
    expect(await first).toEqual({ compressed: 1, deleted: 0 })
    await writer.close()
    expect((await compressedContent()).trimEnd().split('\n')).toHaveLength(1000)
    expect(JSON.parse(await readFile(join(directory, 'access-2026-05-21.ndjson'), 'utf8')).id).toBe('today')
  })
})

describe('access file retention and safety', () => {
  it('uses a strict UTC whole-day cutoff, deletes both representations, and keeps the boundary day', async () => {
    await put('access-2026-05-17.ndjson')
    await put('access-2026-05-17.ndjson.gz', gzipSync(content))
    await put('access-2026-05-18.ndjson.gz', gzipSync(content))
    await put('access-2026-05-19.ndjson') // boundary at today minus two days
    await put(yesterday)
    await put('access-2026-05-21.ndjson')
    expect(await writer.maintain(new Date('2026-05-21T20:05:00-03:00'), 2)).toEqual({ compressed: 2, deleted: 3 })
    expect(await files()).toEqual(['access-2026-05-19.ndjson.gz', `${yesterday}.gz`, 'access-2026-05-21.ndjson'])
  })

  it('ignores unknown names, impossible calendar dates and directories', async () => {
    const names = ['.index.json', 'notes.txt', 'access-buffer.ndjson', 'access-2026-02-30.ndjson', 'access-2026-13-01.ndjson', 'access-2026-05-1.ndjson', 'access-2026-05-01.ndjson.migrating', 'access-2026-05-01.ndjson.gz.tmp', 'access-2026-05-01.ndjson.gz.bak']
    for (const name of names) await put(name)
    await mkdir(join(directory, 'access-2026-05-02.ndjson'))
    expect(await writer.maintain(now, 1)).toEqual({ compressed: 0, deleted: 0 })
    expect(await files()).toEqual([...names, 'access-2026-05-02.ndjson'].sort())
  })

  it.for(['source', 'gzip', 'temp', 'directory'])('does not follow or remove a %s symlink', async (kind, context) => {
    const target = join(directory, 'outside')
    await put('outside', 'must remain untouched')
    const link = kind === 'source' ? yesterday : kind === 'gzip' ? `${yesterday}.gz` : kind === 'temp' ? `${yesterday}.gz.tmp` : 'linked-dir'
    try {
      await symlink(kind === 'directory' ? directory : target, join(directory, link), kind === 'directory' ? 'junction' : 'file')
    } catch (error) {
      // Windows environments without symlink privileges cannot exercise file links.
      if ((error as NodeJS.ErrnoException).code === 'EPERM') { context.skip(); return }
      throw error
    }
    if (kind === 'directory') {
      await writer.close()
      writer = createAccessLogStore({ dir: () => join(directory, link) })
    } else if (kind !== 'source') await put(yesterday)
    expect(await writer.maintain(now, 30)).toEqual({ compressed: 0, deleted: 0 })
    expect(await readFile(target, 'utf8')).toBe('must remain untouched')
    expect(await files()).toContain(link)
    if (kind === 'source') expect(await writer.maintain(new Date('2026-05-23T00:05:00Z'), 1)).toEqual({ compressed: 0, deleted: 0 })
  })

  it('does not create a missing directory', async () => {
    await writer.close()
    writer = createAccessLogStore({ dir: () => join(directory, 'missing') })
    expect(await writer.maintain(now, 30)).toEqual({ compressed: 0, deleted: 0 })
    expect(await files()).toEqual([])
  })

  it.each([0, -1, 0.5, NaN, Infinity, 3651])('rejects unsafe retention %s without touching files', async (days) => {
    await put(yesterday)
    await expect(writer.maintain(now, days)).rejects.toThrow('Access log retention days')
    expect(await files()).toEqual([yesterday])
  })

  it('rejects an invalid clock and clears its flight for the next run', async () => {
    await put(yesterday)
    await expect(writer.maintain(new Date('invalid'), 30)).rejects.toThrow('Invalid access log maintenance date')
    expect(await writer.maintain(now, 30)).toEqual({ compressed: 1, deleted: 0 })
  })
})
