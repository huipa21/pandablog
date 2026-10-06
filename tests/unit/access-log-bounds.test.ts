import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAccessLogReader } from '../../server/utils/access-log-reader'

const now = new Date('2026-05-21T12:30:00Z')
const q = {limit: 1, offset: 0, sort: 'newest' as const, includeTotal: true}
const line = (id: string) => JSON.stringify({ts: now.toISOString(), id, m: 'GET', p: '/', s: 200, d: 1}) + '\n'
async function fixture(work: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'pb-reader-bounds-'))
  try {await work(dir)} finally {await rm(dir, {recursive: true, force: true})}
}
describe('access reader resource/accuracy regressions', () => {
  it('drains an oversized line without retaining/parsing it, then returns the newest valid row and discloses the loss', () => fixture(async dir => {
    await writeFile(join(dir, 'access-2026-05-21.ndjson'), 'x'.repeat(4 * 1024 * 1024) + '\n' + line('newest'))
    const reader = createAccessLogReader({dir: () => dir, now: () => now})
    const result = await reader.queryAccessLogs(q)
    expect(result.rows[0]?.request_id).toBe('newest'); expect(result.truncated).toBe(true)
  }))
  it('never presents an incomplete ascending prefix as a newest page', () => fixture(async dir => {
    await writeFile(join(dir, 'access-2026-05-21.ndjson'), line('old') + line('new'))
    const reader = createAccessLogReader({dir: () => dir, now: () => now, maxLines: 1})
    expect(await reader.queryAccessLogs(q)).toMatchObject({rows: [], truncated: true})
    await expect(reader.readAccessLogById('2026-05-21:missing')).rejects.toMatchObject({statusCode: 503})
    await expect(reader.accessHourly()).rejects.toMatchObject({statusCode: 503})
  }))
  it('byte exhaustion is unavailable for detail/hourly/stats, not false 404/zero', () => fixture(async dir => {
    await writeFile(join(dir, 'access-2026-05-21.ndjson'), line('old') + line('new'))
    const reader = createAccessLogReader({dir: () => dir, now: () => now, maxScanBytes: 10})
    await expect(reader.readAccessLogById('2026-05-21:missing')).rejects.toMatchObject({statusCode: 503})
    await expect(reader.accessHourly()).rejects.toMatchObject({statusCode: 503})
    await expect(reader.accessStats()).rejects.toMatchObject({statusCode: 503})
  }))
  it('retains a one-row newest window as raw traffic grows 10x, with bounded encoded bytes', () => fixture(async dir => {
    const reader = createAccessLogReader({dir: () => dir, now: () => now})
    const samples = []
    for (const size of [100, 1000]) {
      const handle = await fs.open(join(dir, 'access-2026-05-21.ndjson'), 'w')
      try {for (let index = 0; index < size; index++) await handle.write(line(String(index)).replace('"p":"/"', `"p":"/","ua":"${'x'.repeat(4096)}"`))} finally {await handle.close()}
      const before = process.memoryUsage(), started = performance.now()
      const result = await reader.queryAccessLogs(q)
      expect(result.rows[0]?.request_id).toBe(String(size - 1)); expect(result.total).toBe(size)
      const diagnostics = reader.diagnostics()
      expect(diagnostics.lastScan.retainedRows).toBe(1)
      expect(diagnostics.lastScan.retainedBytes).toBeLessThan(8192)
      samples.push({size, before, after: process.memoryUsage(), elapsedMs: performance.now() - started, diagnostics})
    }
    process.stdout.write(JSON.stringify({evidence: 'REV-4.3-owned-reader-not-Nitro-or-constrained-production', samples}) + '\n')
  }))
  it('counts active-file appends from a verified byte offset and invalidates on truncate', () => fixture(async dir => {
    const file = join(dir, 'access-2026-05-21.ndjson')
    await writeFile(file, line('one') + 'unterminated')
    const reader = createAccessLogReader({dir: () => dir, now: () => now})
    expect((await reader.accessStats()).count).toBe(2)
    const cache = JSON.parse(await readFile(join(dir, '.index.json'), 'utf8'))
    expect(cache['access-2026-05-21.ndjson'].offset).toBe((await fs.stat(file)).size)
    const starts: number[] = []
    const io = {...fs, open: async (...args: Parameters<typeof fs.open>) => {
      const handle = await fs.open(...args), stream = handle.createReadStream.bind(handle)
      handle.createReadStream = options => {if (options?.start) starts.push(options.start); return stream(options)}
      return handle
    }}
    await appendFile(file, '\n' + line('two'))
    expect((await createAccessLogReader({dir: () => dir, fs: io, now: () => now}).accessStats()).count).toBe(3)
    expect(starts.some(start => start > 0)).toBe(true)
    await writeFile(file, line('replacement'))
    expect((await reader.accessStats()).count).toBe(1)
  }))
})
