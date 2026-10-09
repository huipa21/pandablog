import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  root: '', createBackupRecord: vi.fn(), updateBackupRecord: vi.fn(), getBackup: vi.fn(), pruneBackups: vi.fn(),
  acquireJob: vi.fn(), releaseJob: vi.fn(), updateJobProgress: vi.fn(), writeDurableJson: vi.fn(), syncDirectory: vi.fn(),
  exportSurrealDb: vi.fn(), sha256File: vi.fn(), collectOriginalPaths: vi.fn(), createMediaTar: vi.fn(),
  getBackupSettings: vi.fn(), queryDb: vi.fn(), useDb: vi.fn(),
}))
vi.mock('../../server/utils/backups/config', () => ({get BACKUPS_ROOT() {return mocks.root}}))
vi.mock('../../server/utils/backups/registry', () => mocks)
vi.mock('../../server/utils/backups/jobMutex', () => mocks)
vi.mock('../../server/utils/backups/surrealHttp', () => mocks)
vi.mock('../../server/utils/backups/tarStream', () => mocks)
vi.mock('../../server/utils/settings', () => mocks)
vi.mock('../../server/utils/db', () => mocks)

beforeEach(async () => {
  vi.resetAllMocks()
  mocks.root = await mkdtemp(join(tmpdir(), 'pb-backup-test-'))
  mocks.writeDurableJson.mockImplementation((file, data) => writeFile(file, JSON.stringify(data)))
  mocks.acquireJob.mockImplementation(async job => ({...job, token: 'a'.repeat(48), generation: 'b'.repeat(48)}))
  mocks.createBackupRecord.mockResolvedValue({created_at: '2026-01-01T00:00:00.000Z'})
  mocks.updateBackupRecord.mockImplementation(async (id, fields) => ({id, type: 'full', ...fields}))
  mocks.getBackup.mockResolvedValue(null)
  mocks.getBackupSettings.mockResolvedValue({max_backups: 0})
  mocks.useDb.mockResolvedValue({}); mocks.queryDb.mockResolvedValue([[]])
  mocks.exportSurrealDb.mockImplementation(async () => Readable.from('fixture dump'))
  mocks.sha256File.mockImplementation(async file => createHash('sha256').update(await readFile(file)).digest('hex'))
  mocks.collectOriginalPaths.mockResolvedValue([])
  mocks.createMediaTar.mockImplementation(async (_files, _root, output) => writeFile(output, gzipSync(Buffer.alloc(1024))))
})
afterEach(async () => {await rm(mocks.root, {recursive: true, force: true})})
async function create() {
  const {startBackupJob} = await import('../../server/utils/backups/create')
  const id = await startBackupJob({note: 'fixture'})
  await vi.waitFor(() => expect(mocks.releaseJob).toHaveBeenCalledOnce())
  return id
}
async function manifest(id: string) {return JSON.parse(await readFile(join(mocks.root, id, 'manifest.json'), 'utf8'))}

describe('full-only creation with real bundle publication and mocked DB export', () => {
  it('refuses interrupted media claims before export/packing', async () => {
    mocks.queryDb.mockResolvedValue([[{id: 'files:pending'}]])
    const id = await create()
    expect(mocks.exportSurrealDb).not.toHaveBeenCalled(); expect(mocks.createMediaTar).not.toHaveBeenCalled()
    expect(mocks.updateBackupRecord).toHaveBeenCalledWith(id, expect.objectContaining({status: 'failed', error: expect.stringContaining('Media publication/deletion recovery')}))
  })
  it('exports the full DB, all originals and a completed bundle before ready', async () => {
    mocks.updateBackupRecord.mockImplementation(async (_id, fields) => {
      if (fields.status === 'ready') expect(await readFile(join(mocks.root, _id, 'backup.tar.gz'))).toHaveLength(fields.bundle_size_bytes)
      return {id: _id, type: 'full', ...fields}
    })
    const id = await create()
    expect(mocks.exportSurrealDb).toHaveBeenCalledExactlyOnceWith()
    expect(mocks.createBackupRecord.mock.calls[0]![0]).toMatchObject({type: 'full', parent: null, chain_root: null, included_tables: null})
    expect(await manifest(id)).toMatchObject({type: 'full', format_version: 1, included_tables: null, excluded_tables: [], note: 'fixture'})
    expect(gunzipSync(await readFile(join(mocks.root, id, 'db.surql.gz'))).toString()).toBe('fixture dump')
    expect(mocks.updateBackupRecord).toHaveBeenCalledWith(id, expect.objectContaining({status: 'ready', bundle_filename: 'backup.tar.gz'}))
  })
  it.each([{type: 'incremental'}, {type: 'partial'}, {parent: null}, {tables: ['post']}, {unknown: true}])('rejects retired options before admission %j', async options => {
    const {startBackupJob} = await import('../../server/utils/backups/create')
    await expect(startBackupJob(options as never)).rejects.toMatchObject({statusCode: 400})
    expect(mocks.acquireJob).not.toHaveBeenCalled(); expect(mocks.createBackupRecord).not.toHaveBeenCalled()
    expect(await readdir(mocks.root)).toEqual([])
  })
  it('ignores retired settings and preserves all tables on export', async () => {
    mocks.getBackupSettings.mockResolvedValue({include_access_logs: true, default_excluded_tables: ['post'], max_backups: 0})
    const id = await create()
    expect(mocks.exportSurrealDb).toHaveBeenCalledExactlyOnceWith()
    expect(await manifest(id)).toMatchObject({included_tables: null, excluded_tables: []})
  })
  it('preserves completed artifacts without relabeling a possibly ready publication as failed', async () => {
    mocks.updateBackupRecord.mockRejectedValueOnce(new Error('lost ready reply'))
    const id = await create()
    expect(await readdir(join(mocks.root, id))).toContain('backup.tar.gz')
    expect(mocks.updateBackupRecord).toHaveBeenCalledOnce()
  })
  it('reconciles an exact ready generation after a lost publication reply without rewriting it', async () => {
    mocks.updateBackupRecord.mockRejectedValueOnce(new Error('lost ready reply'))
    mocks.getBackup.mockImplementation(async id => ({id, type: 'full', ...mocks.updateBackupRecord.mock.calls[0]![1]}))
    const id = await create()
    expect(mocks.getBackup).toHaveBeenCalledWith(id)
    expect(mocks.updateBackupRecord).toHaveBeenCalledOnce()
    expect(await readdir(join(mocks.root, id))).toContain('backup.tar.gz')
  })
  it('fails packaging/integrity before ready and cleans only its owned unpublished directory', async () => {
    mocks.sha256File.mockResolvedValue('a'.repeat(64))
    const id = await create()
    expect(mocks.updateBackupRecord).toHaveBeenCalledWith(id, expect.objectContaining({status: 'failed'}))
    expect(mocks.updateBackupRecord.mock.calls.some(call => call[1].status === 'ready')).toBe(false)
    expect(await readdir(mocks.root)).not.toContain(id)
  })
  it('strictly rejects non-full/unknown/contradictory legacy manifests', async () => {
    const {parseBackupManifest} = await import('../../server/utils/backups/importExternal')
    expect(parseBackupManifest(Buffer.from(JSON.stringify({type: 'full', excluded_tables: ['access_logs']})))).toMatchObject({excluded_tables: ['access_logs']})
    for (const raw of [{excluded_tables: []}, {type: 'partial'}, {type: 'full', parent: 'base'}, {type: 'full', excluded_tables: [42]}]) expect(() => parseBackupManifest(Buffer.from(JSON.stringify(raw)))).toThrow()
  })
  it('does not require settings to export a full snapshot', async () => {
    mocks.getBackupSettings.mockRejectedValue(new Error('settings unavailable'))
    const id = await create()
    expect(mocks.updateBackupRecord).toHaveBeenCalledWith(id, expect.objectContaining({status: 'ready'}))
  })
})
