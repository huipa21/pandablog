import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupRecord } from '../../../server/utils/backups/config'
import { ensureBundle } from '../../../server/utils/backups/package'
import { hashFile, unpackBundle } from '../../../server/utils/backups/bundle'
const mocks = vi.hoisted(() => ({root: '', getBackup: vi.fn(), updateBackupRecord: vi.fn(), acquireJob: vi.fn(), releaseJob: vi.fn(), updateJobProgress: vi.fn(), syncDirectory: vi.fn(), writeDurableJson: vi.fn()}))
vi.mock('../../../server/utils/backups/config', () => ({get BACKUPS_ROOT() {return mocks.root}}))
vi.mock('../../../server/utils/backups/registry', () => ({...mocks, backupIdPart: (id: string) => id.replace(/^backups:/, '')}))
vi.mock('../../../server/utils/backups/jobMutex', () => mocks)
let record: BackupRecord, directory: string
beforeEach(async () => {
  vi.resetAllMocks()
  mocks.root = await mkdtemp(join(tmpdir(), 'pb-package-owned-')); directory = join(mocks.root, 'legacy'); await mkdir(directory)
  await writeFile(join(directory, 'db.surql.gz'), gzipSync('OPTION IMPORT; DEFINE TABLE post;'))
  await writeFile(join(directory, 'media.tar.gz'), gzipSync(Buffer.alloc(1024)))
  record = {id: 'backups:legacy', type: 'full', status: 'ready', parent: null, chain_root: null, included_tables: null, created_at: '2026-01-01T00:00:00.000Z', note: 'old', included_hashes: [], media_file_count: 0, db_size_bytes: (await readFile(join(directory, 'db.surql.gz'))).length, media_size_bytes: (await readFile(join(directory, 'media.tar.gz'))).length, manifest_sha256_db: await hashFile(join(directory, 'db.surql.gz')), manifest_sha256_media: await hashFile(join(directory, 'media.tar.gz')), completed_at: null, error: null}
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({id: 'legacy', type: 'full', parent: null, chain_root: null, included_tables: null, created_at: record.created_at, sha256_db: record.manifest_sha256_db, sha256_media: record.manifest_sha256_media, included_hashes: [], media_file_count: 0, excluded_tables: []}))
  mocks.getBackup.mockImplementation(async () => record)
  mocks.updateBackupRecord.mockImplementation(async (_id, fields) => {Object.assign(record, fields); return record})
  mocks.acquireJob.mockResolvedValue({id: 'legacy', kind: 'package', token: 'a'.repeat(48)})
  mocks.writeDurableJson.mockImplementation((file, data) => writeFile(file, JSON.stringify(data)))
})
afterEach(async () => {await rm(mocks.root, {recursive: true, force: true})})
describe('legacy full lazy packaging and publication reconciliation (real FS)', () => {
  it('packages once from original files, preserves all three original bytes and adapts only the envelope manifest', async () => {
    const before = await Promise.all(['db.surql.gz', 'media.tar.gz', 'manifest.json'].map(name => readFile(join(directory, name))))
    const file = await ensureBundle(record)
    expect(await ensureBundle(record)).toBe(file)
    expect(mocks.acquireJob).toHaveBeenCalledOnce(); expect(mocks.releaseJob).toHaveBeenCalledOnce()
    const unpacked = await unpackBundle(file, join(mocks.root, 'unpacked'))
    expect(JSON.parse(unpacked.manifestBuffer.toString())).toMatchObject({format_version: 1, id: 'legacy', type: 'full', note: 'old'})
    expect(await Promise.all(['db.surql.gz', 'media.tar.gz', 'manifest.json'].map(name => readFile(join(directory, name))))).toEqual(before)
  })
  it('preserves historical split-import long notes as bounded provenance without loosening new notes', async () => {
    record.note = 'x'.repeat(2000)
    const file = await ensureBundle(record)
    const unpacked = await unpackBundle(file, join(mocks.root, 'unpacked'))
    expect(JSON.parse(unpacked.manifestBuffer.toString())).toMatchObject({note: null, source_note: record.note})
  })
  it('reconciles an exact completed target after a lost metadata publication without overwriting it', async () => {
    mocks.updateBackupRecord.mockRejectedValueOnce(new Error('lost reply'))
    await expect(ensureBundle(record)).rejects.toThrow('lost reply')
    const bytes = await readFile(join(directory, 'backup.tar.gz'))
    await ensureBundle(record)
    expect(await readFile(join(directory, 'backup.tar.gz'))).toEqual(bytes)
    expect(record.bundle_filename).toBe('backup.tar.gz')
  })
  it('preserves original files and unfamiliar target when reconciliation fails', async () => {
    await writeFile(join(directory, 'backup.tar.gz'), 'unrecognized')
    await expect(ensureBundle(record)).rejects.toThrow()
    expect(await readFile(join(directory, 'backup.tar.gz'), 'utf8')).toBe('unrecognized')
    expect(await readdir(mocks.root)).toEqual(['legacy'])
    expect(mocks.updateBackupRecord).not.toHaveBeenCalled()
  })
  it.each(['partial', 'incremental', 'future', null])('refuses type %s before acquiring a package owner', async type => {
    record.type = type
    await expect(ensureBundle(record)).rejects.toThrow(/legacy/)
    expect(mocks.acquireJob).not.toHaveBeenCalled(); expect(mocks.updateBackupRecord).not.toHaveBeenCalled()
  })
})
