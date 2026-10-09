/** Opt-in finite codec measurement only. No application/DB/env/archive inputs. */
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { assertRuntime, createOwnedStorage } from './fixture'
import { writeSqlFixture } from './generate'
import { streamToFile } from '../../server/utils/backups/streams'
import { createMediaTar } from '../../server/utils/backups/tarStream'
import { packBundle, unpackBundle, hashFile } from '../../server/utils/backups/bundle'
import { writeDurableJson } from '../../server/utils/backups/jobMutex'

async function main() {
  if (process.argv.slice(2).join(' ') !== '--fixture') throw new Error('Use --fixture with Node 22.22.0; no external inputs accepted')
  assertRuntime()
  for (const kind of ['compressible', 'incompressible'] as const) {
    const storage = await createOwnedStorage()
    let peak = process.memoryUsage().rss
    const timer = setInterval(() => {peak = Math.max(peak, process.memoryUsage().rss)}, 10)
    try {
      const components = storage.path('components'), originals = storage.path('originals')
      await mkdir(components); await mkdir(join(originals, '2020/01'), {recursive: true})
      const seed = await writeSqlFixture(storage, 'sql.surql', {rows: 4096, payloadBytes: 8192, chunkBytes: 64 * 1024})
      await streamToFile(createReadStream(storage.path('sql.surql')), join(components, 'db.surql.gz'), {gzip: true})
      const temporary = storage.path('original'), original = await open(temporary, 'wx', 0o600)
      try {
        for (let i = 0; i < 256; i++) await original.write(kind === 'incompressible' ? randomBytes(64 * 1024) : Buffer.alloc(64 * 1024, 1))
        await original.sync()
      } finally {await original.close()}
      const hash = await hashFile(temporary), relative = `2020/01/${hash}.bin`
      await rename(temporary, join(originals, relative))
      await createMediaTar([relative], originals, join(components, 'media.tar.gz'))
      const dbBytes = (await stat(join(components, 'db.surql.gz'))).size, mediaBytes = (await stat(join(components, 'media.tar.gz'))).size
      await writeDurableJson(join(components, 'manifest.json'), {format: 'pandablog-backup', format_version: 1, id: 'owned-codec-measurement', type: 'full', parent: null, chain_root: null, included_tables: null, created_at: '2026-01-01T00:00:00.000Z', note: null, sha256_db: await hashFile(join(components, 'db.surql.gz')), sha256_media: await hashFile(join(components, 'media.tar.gz')), db_size_bytes: dbBytes, media_size_bytes: mediaBytes, media_file_count: 1, included_hashes: [hash], excluded_tables: []})
      const manifestBytes = (await stat(join(components, 'manifest.json'))).size
      const before = process.memoryUsage(), cpu = process.cpuUsage(), started = performance.now()
      const bundle = await packBundle(components)
      const packMs = performance.now() - started, packCpu = process.cpuUsage(cpu)
      const unpackAt = performance.now()
      await unpackBundle(join(components, 'backup.tar.gz'), storage.path('unpacked'))
      const componentBytes = dbBytes + mediaBytes + manifestBytes
      console.info(JSON.stringify({evidence: 'owned-finite-codec-driver-not-Nitro-or-DB-scale', node: process.version, platform: process.platform, kind, sqlSeed: seed, expandedOriginalBytes: 16 * 1024 * 1024, dbBytes, mediaBytes, manifestBytes, componentBytes, bundleBytes: bundle.bundle_size_bytes, snapshotBytes: componentBytes + bundle.bundle_size_bytes, bundleToComponentRatio: bundle.bundle_size_bytes / componentBytes, knownOwnedPeakDiskBytes: seed.bytes + 16 * 1024 * 1024 + componentBytes * 2 + bundle.bundle_size_bytes, packMs, packCpuMicroseconds: packCpu, unpackMs: performance.now() - unpackAt, before, after: process.memoryUsage(), sampledDriverPeakRss: peak}))
    } finally {clearInterval(timer); await storage.cleanup()}
  }
}
main().catch(() => {console.error('Owned bundle measurement failed; no configured data used'); process.exitCode = 1})
