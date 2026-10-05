import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAccessLogStore } from '../../server/utils/access-log-store'

const failures = vi.hoisted(() => ({ unlink: false }))
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>()
  return { ...fs, unlink: async (path: Parameters<typeof fs.unlink>[0]) => {
    if (failures.unlink && String(path).endsWith('.ndjson.gz')) throw new Error('injected purge failure')
    return fs.unlink(path)
  } }
})
let directory: string
let writer: ReturnType<typeof createAccessLogStore>
const now = new Date('2026-05-21T12:00:00Z')
const today = 'access-2026-05-21.ndjson'
const old = 'access-2026-05-20.ndjson.gz'
const row = { method: 'GET', path: '/test', status_code: 200, response_time_ms: 1, request_id: 'before' }
beforeEach(async () => {
  failures.unlink = false
  directory = await mkdtemp(join(tmpdir(), 'pandablog-access-purge-'))
  writer = createAccessLogStore({ dir: () => directory, now: () => now })
})
afterEach(async () => {
  failures.unlink = false
  await writer.close()
  await rm(directory, { recursive: true, force: true })
})
const put = (name: string, content: string | Buffer) => writeFile(join(directory, name), content)
const contents = () => readFile(join(directory, today), 'utf8')

describe('access file purge', () => {
  it('counts all flushed lines, deletes closed files and truncates/preserves the active filename', async () => {
    await put(old, gzipSync('one\ntwo\n'))
    for (let index = 0; index < 1000; index++) writer.append(row)
    expect(await writer.purge()).toBe(1002)
    expect(await readdir(directory)).toEqual([today])
    expect(await contents()).toBe('')
    writer.append({ ...row, request_id: 'after' })
    await writer.close()
    expect(JSON.parse(await contents()).id).toBe('after')
  })

  it('single-flights purge and snapshots/replays requests arriving during it', async () => {
    writer.append(row)
    const first = writer.purge()
    expect(writer.purge()).toBe(first)
    const entry = { ...row, request_id: 'during', query_params: { page: '1' } }
    writer.append(entry)
    entry.query_params.page = 'mutated'
    expect(await first).toBe(1)
    writer.append({ ...row, request_id: 'after' })
    await writer.close()
    const lines = (await contents()).trimEnd().split('\n').map(line => JSON.parse(line))
    expect(lines.map(row => row.id)).toEqual(['during', 'after'])
    expect(lines[0].q).toEqual({ page: '1' })
  })

  it('bounds buffered writes and reports dropped entries while purging', async () => {
    const warn = vi.fn()
    await writer.close()
    writer = createAccessLogStore({ dir: () => directory, now: () => now, warn })
    writer.append(row)
    const purge = writer.purge()
    writer.append({ ...row, query_params: { big: 'x'.repeat(8 * 1024 * 1024) } })
    writer.append({ ...row, request_id: 'small' })
    expect(await purge).toBe(1)
    await writer.close()
    expect(JSON.parse(await contents()).id).toBe('small')
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('queue full'), { dropped: 1 })
  })

  it('honors writer IO backoff when replaying requests after purge', async () => {
    await writer.close()
    const open = vi.fn(() => { throw new Error('permission denied') })
    writer = createAccessLogStore({ dir: () => directory, now: () => now, open, warn: vi.fn() })
    writer.append(row) // First failure allows a retry.
    const purge = writer.purge()
    for (let index = 0; index < 100; index++) writer.append(row)
    expect(await purge).toBe(0)
    expect(open).toHaveBeenCalledTimes(2) // Second failure backs off; no retry storm.
  })

  it('shutdown waits for an in-progress purge and drains its buffered requests', async () => {
    writer.append(row)
    const purge = writer.purge()
    writer.append({ ...row, request_id: 'during' })
    const close = writer.close()
    expect(await purge).toBe(1)
    await close
    expect(JSON.parse(await contents()).id).toBe('during')
    writer.append(row)
    expect(JSON.parse(await contents()).id).toBe('during')
  })

  it('serializes purge with maintenance, including subsequent maintenance triggers', async () => {
    await put(old, gzipSync('one\ntwo\n'))
    writer.append(row)
    const maintenance = writer.maintain(now, 30)
    const purge = writer.purge()
    expect(await maintenance).toEqual({ compressed: 0, deleted: 0 })
    expect(await purge).toBe(3)
    writer.append(row)
    const nextPurge = writer.purge()
    const nextMaintenance = writer.maintain(now, 30)
    expect(await nextPurge).toBe(1)
    expect(await nextMaintenance).toEqual({ compressed: 0, deleted: 0 })
    expect(await contents()).toBe('')
  })

  it('does not double-count gzip/plain recovery leftovers; removes both and invalidates cache', async () => {
    await put(old, gzipSync('one\ntwo\n'))
    await put(old.slice(0, -3), 'one\ntwo\nthree\n')
    await put('.index.json', '{}')
    expect(await writer.purge()).toBe(3)
    expect(await readdir(directory)).toEqual([])
    expect(await writer.purge()).toBe(0)
  })

  it('ignores unknown/temporary/migration files, impossible days and directories', async () => {
    const names = ['notes.txt', 'access-2026-02-30.ndjson', 'access-2026-05-20.ndjson.gz.tmp', 'access-2026-05-20.ndjson.migrating']
    for (const name of names) await put(name, 'keep')
    await mkdir(join(directory, today))
    await put(old, gzipSync('one\n'))
    expect(await writer.purge()).toBe(1)
    expect((await readdir(directory)).sort()).toEqual([...names, today].sort())
  })

  it('does not create missing directories or delete files when counting an archive fails', async () => {
    await writer.close()
    writer = createAccessLogStore({ dir: () => join(directory, 'missing') })
    expect(await writer.purge()).toBe(0)
    expect(await readdir(directory)).toEqual([])
    await writer.close()
    writer = createAccessLogStore({ dir: () => directory })
    await put(old, 'corrupt gzip')
    await put(today, 'today\n')
    await expect(writer.purge()).rejects.toThrow()
    expect((await readdir(directory)).sort()).toEqual([old, today].sort())
    expect(await contents()).toBe('today\n')
  })

  it('propagates failure, resumes queued writes and allows retry', async () => {
    await put(old, gzipSync('one\n'))
    writer.append(row)
    failures.unlink = true
    const purge = writer.purge()
    writer.append({ ...row, request_id: 'during' })
    await expect(purge).rejects.toThrow('injected purge failure')
    failures.unlink = false
    expect(await writer.purge()).toBe(3)
    expect(await contents()).toBe('')
    writer.append({ ...row, request_id: 'after-retry' })
    await writer.close()
    expect(JSON.parse(await contents()).id).toBe('after-retry')
  })

  it.for(['file', 'cache', 'directory'])('does not follow or remove a %s symlink', async (kind, context) => {
    const outside = join(directory, 'outside')
    await put('outside', 'must remain')
    const name = kind === 'file' ? today : kind === 'cache' ? '.index.json' : 'linked-dir'
    try { await symlink(kind === 'directory' ? directory : outside, join(directory, name), kind === 'directory' ? 'junction' : 'file') } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') { context.skip(); return }
      throw error
    }
    if (kind === 'directory') {
      await writer.close()
      writer = createAccessLogStore({ dir: () => join(directory, name) })
    }
    expect(await writer.purge()).toBe(0)
    expect(await readFile(outside, 'utf8')).toBe('must remain')
    expect(await readdir(directory)).toContain(name)
  })
})
