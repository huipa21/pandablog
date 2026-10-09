import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { packBundle, unpackBundle } from '../../../server/utils/backups/bundle'
import { parseFullManifest } from '../../../server/utils/backups/manifest'

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
async function owned(work: (root: string, source: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'pb-bundle-owned-')), source = join(root, 'source')
  try {
    await mkdir(source)
    const db = gzipSync('OPTION IMPORT; DEFINE TABLE post;'), media = gzipSync(Buffer.alloc(1024))
    await writeFile(join(source, 'db.surql.gz'), db); await writeFile(join(source, 'media.tar.gz'), media)
    await writeFile(join(source, 'manifest.json'), JSON.stringify({format: 'pandablog-backup', format_version: 1, id: 'source', type: 'full', parent: null, chain_root: null, included_tables: null, created_at: '2026-01-01T00:00:00.000Z', note: null, sha256_db: sha(db), sha256_media: sha(media), db_size_bytes: db.length, media_size_bytes: media.length, media_file_count: 0, included_hashes: [], excluded_tables: []}))
    await work(root, source)
  } finally {await rm(root, {recursive: true, force: true})}
}
function alterHeader(bytes: Buffer, mutate: (header: Buffer) => void) {
  const copy = Buffer.from(bytes), header = copy.subarray(0, 512)
  mutate(header)
  header.fill(32, 148, 156)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii')
  return copy
}

describe('portable full bundle codec (real streams and filesystem)', () => {
  it('round trips exact three root members, unchanged inner bytes and valid empty media', () => owned(async (root, source) => {
    const metadata = await packBundle(source)
    const envelope = await readFile(join(source, 'backup.tar.gz'))
    expect(metadata.bundle_sha256).toBe(sha(envelope)); expect(metadata.bundle_size_bytes).toBe(envelope.length)
    const stage = join(root, 'stage')
    await unpackBundle(join(source, 'backup.tar.gz'), stage)
    expect((await readdir(stage)).sort()).toEqual(['db.surql.gz', 'manifest.json', 'media.tar.gz'])
    for (const name of ['db.surql.gz', 'media.tar.gz', 'manifest.json']) expect(await readFile(join(stage, name))).toEqual(await readFile(join(source, name)))
    expect(gunzipSync(await readFile(join(stage, 'media.tar.gz')))).toEqual(Buffer.alloc(1024))
    await expect(packBundle(source)).rejects.toThrow()
    expect(await readFile(join(source, 'backup.tar.gz'))).toEqual(envelope)
  }))
  it.each(['../db.surql.gz', './db.surql.gz', '/db.surql.gz', 'C:/db.surql.gz', 'DB.surql.gz', 'db\\surql.gz', 'other'])('refuses unsafe/alias/extra member %s', name => owned(async (root, source) => {
    await packBundle(source)
    const bytes = alterHeader(gunzipSync(await readFile(join(source, 'backup.tar.gz'))), header => {header.fill(0, 0, 100); header.write(name, 0)})
    await writeFile(join(root, 'hostile'), gzipSync(bytes))
    await expect(unpackBundle(join(root, 'hostile'), join(root, 'stage'))).rejects.toThrow()
    expect(await readdir(root)).not.toContain('stage')
  }))
  it.each([0, 124, 257])('rejects high-bit byte aliases in fixed names/numerics/magic at %s', offset => owned(async (root, source) => {
    await packBundle(source)
    const bytes = alterHeader(gunzipSync(await readFile(join(source, 'backup.tar.gz'))), header => {header[offset] = header[offset]! | 0x80})
    await writeFile(join(root, 'hostile'), gzipSync(bytes))
    await expect(unpackBundle(join(root, 'hostile'), join(root, 'stage'))).rejects.toThrow()
  }))
  it.each(['1', '2', '3', '4', '5', '6', 'x', 'g', 'S'])('refuses nonregular/metadata type %s', type => owned(async (root, source) => {
    await packBundle(source)
    const bytes = alterHeader(gunzipSync(await readFile(join(source, 'backup.tar.gz'))), header => {header.write(type, 156)})
    await writeFile(join(root, 'hostile'), gzipSync(bytes))
    await expect(unpackBundle(join(root, 'hostile'), join(root, 'stage'))).rejects.toThrow()
  }))
  it('rejects duplicate, missing, truncated, corrupt and trailing archives with owned cleanup', () => owned(async (root, source) => {
    await packBundle(source)
    const archive = await readFile(join(source, 'backup.tar.gz')), raw = gunzipSync(archive)
    const second = 1024 // first compressed DB fits one 512-byte body
    const duplicate = Buffer.concat([raw.subarray(0, second), raw.subarray(0, second), raw.subarray(second)])
    for (const [index, bytes] of [gzipSync(duplicate), gzipSync(raw.subarray(0, second)), gzipSync(Buffer.concat([raw, raw])), gzipSync(Buffer.concat([raw, Buffer.from('junk')])), archive.subarray(0, archive.length - 4), Buffer.from('not gzip')].entries()) {
      const file = join(root, `hostile-${index}`); await writeFile(file, bytes)
      await expect(unpackBundle(file, join(root, `stage-${index}`))).rejects.toThrow()
      expect(await readdir(root)).not.toContain(`stage-${index}`)
    }
  }))
  it('enforces encoded, expanded, member budgets and abort without destroying existing stages', () => owned(async (root, source) => {
    await packBundle(source)
    for (const limits of [{encodedBytes: 16}, {expandedBytes: 512}, {dbBytes: 1}]) await expect(unpackBundle(join(source, 'backup.tar.gz'), join(root, 'stage'), {limits})).rejects.toThrow()
    const controller = new AbortController(); controller.abort()
    await expect(unpackBundle(join(source, 'backup.tar.gz'), join(root, 'stage'), {signal: controller.signal})).rejects.toThrow()
    expect(await readdir(root)).not.toContain('stage')
    await mkdir(join(root, 'existing')); await writeFile(join(root, 'existing', 'sentinel'), 'preserve')
    await expect(unpackBundle(join(source, 'backup.tar.gz'), join(root, 'existing'))).rejects.toThrow()
    expect(await readFile(join(root, 'existing', 'sentinel'), 'utf8')).toBe('preserve')
  }))
  it('strictly validates version, full assertion, bounds and schema', () => owned(async (_root, source) => {
    const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
    for (const change of [{format_version: 2}, {format_version: undefined}, {type: 'partial'}, {parent: 'base'}, {included_tables: []}, {db_size_bytes: -1}, {media_file_count: 1.5}, {created_at: 'yesterday'}, {extra: true}, {note: 'x'.repeat(501)}]) expect(() => parseFullManifest(Buffer.from(JSON.stringify({...manifest, ...change})))).toThrow()
  }))
})
