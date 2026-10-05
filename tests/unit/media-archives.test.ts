import { createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { createOwnedStorage } from '../../scripts/backend-hardening/fixture'
import { MediaArchiveStore } from '../../server/utils/media-archives'

const epoch = 'a'.repeat(48)
async function fixture() {
  const owned = await createOwnedStorage()
  const root = owned.path('downloads'), sources = owned.path('sources')
  await mkdir(sources)
  await writeFile(join(sources, 'first.txt'), 'first fixture bytes')
  await writeFile(join(sources, 'second.txt'), 'second fixture bytes')
  const files = [
    {hash: 'a'.repeat(64), original_name: '../first.txt', original_path: 'first.txt'},
    {hash: 'b'.repeat(64), original_name: 'second.txt', original_path: 'second.txt'}
  ]
  return {owned, root, sources, files}
}
// Independent tiny fixture-only ZIP reader: validate central/local headers and
// inflate the actual stored members. Never used on application/production ZIPs.
function openFixtureZip(buffer: Buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  expect(end).toBeGreaterThan(0)
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const members = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    expect(buffer.readUInt32LE(offset)).toBe(0x02014b50)
    const method = buffer.readUInt16LE(offset + 10), compressed = buffer.readUInt32LE(offset + 20)
    const expanded = buffer.readUInt32LE(offset + 24), nameLength = buffer.readUInt16LE(offset + 28)
    const extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32)
    const local = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString()
    expect(buffer.readUInt32LE(local)).toBe(0x04034b50)
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    const bytes = buffer.subarray(start, start + compressed)
    const plain = method === 8 ? inflateRawSync(bytes) : bytes
    expect(plain.length).toBe(expanded)
    members.set(name, plain.toString())
    offset += 46 + nameLength + extra + comment
  }
  return members
}

describe('real Archiver 8 owned archive lifecycle', () => {
  it('round trips two files; owner/epoch/expiry authorize metadata; cleanup removes only expired ready artifacts', async () => {
    const f = await fixture()
    let now = Date.now()
    const store = new MediaArchiveStore(f.root, f.sources, {now: () => now})
    try {
      const name = await store.create(f.files, 'users:fixture', epoch, {ttlMs: 1000})
      const meta = await store.authorize(name, 'users:fixture', epoch)
      expect(meta.hashes).toEqual(f.files.map(file => file.hash))
      const readers = Array.from({length: 8}, () => store.stream(name))
      expect(() => store.stream(name)).toThrow(/capacity/)
      expect(store.diagnostics().activeReaders).toBe(8)
      const closed = readers.map(reader => once(reader, 'close'))
      readers.forEach(reader => reader.destroy())
      await Promise.all(closed)
      expect(store.diagnostics().activeReaders).toBe(0)
      const bytes = await readFile(store.path(name))
      expect(bytes.length).toBeLessThan(4096)
      expect([...openFixtureZip(bytes)]).toEqual([['001_first.txt', 'first fixture bytes'], ['002_second.txt', 'second fixture bytes']])
      await expect(store.authorize(name, 'users:other', epoch)).rejects.toThrow()
      await expect(store.authorize(name, 'users:fixture', 'b'.repeat(48))).rejects.toThrow()
      await store.cleanup()
      expect(await readdir(f.root)).toHaveLength(2)
      now += 1001
      await expect(store.authorize(name, 'users:fixture', epoch)).rejects.toThrow()
      await store.cleanup()
      expect(await readdir(f.root)).toEqual([])
    } finally {await f.owned.cleanup()}
  })
  it('write failure has no unhandled stream rejection/orphan and releases job admission', async () => {
    const f = await fixture()
    let fail = true
    const store = new MediaArchiveStore(f.root, f.sources, {output: path => {
      const output = createWriteStream(path, {flags: 'wx'})
      if (fail) output.once('open', () => {fail = false; output.destroy(new Error('fixture ENOSPC'))})
      return output
    }})
    try {
      await expect(store.create(f.files, 'users:fixture', epoch, {ttlMs: 1000})).rejects.toThrow()
      expect(await readdir(f.root)).toEqual([])
      await expect(store.create(f.files, 'users:fixture', epoch, {ttlMs: 1000})).resolves.toMatch(/^media-/)
    } finally {await f.owned.cleanup()}
  })
  it('bounds source bytes/ready jobs, rejects unknown/missing sources and aborts without published artifacts', async () => {
    const f = await fixture()
    const tiny = new MediaArchiveStore(f.root, f.sources, {limits: {maxSourceBytes: 1}})
    try {
      await expect(tiny.create(f.files, 'users:fixture', epoch, {ttlMs: 1000})).rejects.toThrow(/budget/)
      const store = new MediaArchiveStore(f.root, f.sources, {limits: {maxReady: 1}})
      await expect(store.create([{...f.files[0]!, original_path: '../../foreign-fixture'}], 'users:fixture', epoch, {ttlMs: 1000})).rejects.toThrow()
      const controller = new AbortController(); controller.abort()
      await expect(store.create(f.files, 'users:fixture', epoch, {ttlMs: 1000, signal: controller.signal})).rejects.toThrow(/abort/i)
      expect(await readdir(f.root)).toEqual([])
      await store.create(f.files, 'users:fixture', epoch, {ttlMs: 1000})
      await expect(store.create(f.files, 'users:fixture', epoch, {ttlMs: 1000})).rejects.toThrow(/capacity/)
      await expect(store.authorize('../anything', 'users:fixture', epoch)).rejects.toThrow()
    } finally {await f.owned.cleanup()}
  })
  it('reserves one job synchronously; cleanup does not delete active partial streams', async () => {
    const f = await fixture()
    const controller = new AbortController()
    let cleanup: Promise<void> | undefined
    const store: MediaArchiveStore = new MediaArchiveStore(f.root, f.sources, {output: path => {
      const output = createWriteStream(path, {flags: 'wx'})
      output.once('open', () => {cleanup = store.cleanup(); controller.abort()})
      return output
    }})
    try {
      const pending = store.create(f.files, 'users:fixture', epoch, {ttlMs: 1000, signal: controller.signal})
      await expect(store.create(f.files, 'users:fixture', epoch, {ttlMs: 1000})).rejects.toThrow(/capacity/)
      await expect(pending).rejects.toThrow()
      await cleanup
      expect(await readdir(f.root)).toEqual([])
    } finally {await f.owned.cleanup()}
  })
})
