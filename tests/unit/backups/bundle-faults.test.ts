import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { setImmediate } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashFile, packBundle, unpackBundle } from '../../../server/utils/backups/bundle'
const faults = vi.hoisted(() => ({mode: '', calls: 0, writes: 0, abort: undefined as AbortController | undefined}))
vi.mock('node:fs/promises', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {...original,
    statfs: async (...args: Parameters<typeof original.statfs>) => {
      const info = await original.statfs(...args)
      if (++faults.calls >= 2 && faults.mode === 'disk') return {...info, bavail: 0}
      if (faults.calls >= 2 && faults.mode === 'abort') faults.abort?.abort()
      return info
    },
    open: async (...args: Parameters<typeof original.open>) => {
      const file = await original.open(...args)
      if (faults.mode !== 'write' || !String(args[0]).includes('stage')) return file
      return new Proxy(file, {get(target, property) {
        if (property === 'write') return async (...input: Parameters<typeof file.write>) => {
          if (++faults.writes >= 2) throw Object.assign(new Error('owned ENOSPC injection'), {code: 'ENOSPC'})
          return target.write(...input)
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      }})
    },
  }
})
let root: string, source: string
beforeEach(async () => {
  faults.mode = ''; faults.calls = 0; faults.writes = 0; faults.abort = undefined
  root = await mkdtemp(join(tmpdir(), 'pb-bundle-fault-owned-')); source = join(root, 'source'); await mkdir(source)
  const db = gzipSync(randomBytes(2 * 1024 * 1024)), media = gzipSync(Buffer.alloc(1024))
  await writeFile(join(source, 'db.surql.gz'), db); await writeFile(join(source, 'media.tar.gz'), media)
  await writeFile(join(source, 'manifest.json'), JSON.stringify({format: 'pandablog-backup', format_version: 1, id: 'owned', type: 'full', parent: null, chain_root: null, included_tables: null, created_at: '2026-01-01T00:00:00.000Z', note: null, sha256_db: await hashFile(join(source, 'db.surql.gz')), sha256_media: await hashFile(join(source, 'media.tar.gz')), db_size_bytes: db.length, media_size_bytes: media.length, media_file_count: 0, included_hashes: [], excluded_tables: []}))
})
afterEach(async () => {faults.mode = ''; await rm(root, {recursive: true, force: true})})
describe('bundle faults with actual FS streams and injected disk/abort/write failures', () => {
  it('settles a mid-pack headroom failure and removes only its unpublished exclusive part', async () => {
    faults.mode = 'disk'; faults.calls = 0
    await expect(packBundle(source)).rejects.toThrow(/headroom/)
    expect(await readdir(source)).toEqual(['db.surql.gz', 'manifest.json', 'media.tar.gz'])
  })
  it.each(['abort', 'disk', 'write'])('settles a mid-unpack %s fault before stage cleanup, preserving the original', async mode => {
    await packBundle(source)
    const archive = join(source, 'backup.tar.gz'), before = await hashFile(archive)
    faults.mode = mode; faults.calls = 0; faults.writes = 0; faults.abort = new AbortController()
    await expect(unpackBundle(archive, join(root, 'stage'), {signal: faults.abort.signal})).rejects.toThrow()
    await setImmediate()
    expect(await readdir(root)).toEqual(['source'])
    expect(await hashFile(archive)).toBe(before)
    if (mode === 'write') expect(faults.writes).toBeGreaterThanOrEqual(2)
  })
})
