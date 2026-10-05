import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  root: '', createBackupRecord: vi.fn(), updateBackupRecord: vi.fn(), getBackup: vi.fn(),
  chainHashUnion: vi.fn(), pruneBackups: vi.fn(), listDatabaseTables: vi.fn(),
  acquireJob: vi.fn(), releaseJob: vi.fn(), updateJobProgress: vi.fn(),
  exportSurrealDb: vi.fn(), sha256File: vi.fn(), collectOriginalPaths: vi.fn(), createMediaTar: vi.fn(),
  getBackupSettings: vi.fn()
}))
vi.mock('../../server/utils/backups/config', () => ({ get BACKUPS_ROOT() { return mocks.root } }))
vi.mock('../../server/utils/backups/registry', () => mocks)
vi.mock('../../server/utils/backups/jobMutex', () => mocks)
vi.mock('../../server/utils/backups/surrealHttp', () => mocks)
vi.mock('../../server/utils/backups/tarStream', () => mocks)
vi.mock('../../server/utils/settings', () => mocks)

beforeEach(async () => {
  vi.resetAllMocks()
  mocks.root = await mkdtemp(join(tmpdir(), 'pb-backup-test-'))
  mocks.listDatabaseTables.mockResolvedValue(['access_logs', 'activity_logs', 'error_logs', 'post'])
  mocks.getBackupSettings.mockResolvedValue({ max_backups: 0 })
  mocks.exportSurrealDb.mockImplementation(() => Promise.resolve(Readable.from('fixture dump')))
  mocks.sha256File.mockResolvedValue('sha256')
  mocks.collectOriginalPaths.mockResolvedValue([])
  mocks.createMediaTar.mockImplementation(async (_files, _root, output) => writeFile(output, 'media'))
  mocks.getBackup.mockResolvedValue({ id: 'base', type: 'full', chain_root: null })
  mocks.chainHashUnion.mockResolvedValue(new Set())
})
afterEach(async () => { await rm(mocks.root, { recursive: true, force: true }) })

async function create(type: 'full' | 'incremental' | 'partial', tables?: string[]) {
  const { startBackupJob } = await import('../../server/utils/backups/create')
  const id = await startBackupJob({ type, parent: type === 'full' ? null : 'base', tables })
  await vi.waitFor(() => expect(mocks.releaseJob).toHaveBeenCalledOnce())
  return id
}

async function manifest(id: string) {
  return JSON.parse(await readFile(join(mocks.root, id, 'manifest.json'), 'utf8'))
}

describe('backup creation', () => {
  it.each(['full', 'incremental'] as const)('exports all remaining DB tables for %s snapshots without marking them partial', async type => {
    const id = await create(type)
    expect(mocks.exportSurrealDb).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(mocks.createBackupRecord.mock.calls[0]![0].included_tables).toBeNull()
    expect(await manifest(id)).toMatchObject({ type, included_tables: null, excluded_tables: [] })
    expect(gunzipSync(await readFile(join(mocks.root, id, 'db.surql.gz'))).toString()).toBe('fixture dump')
    expect(mocks.updateBackupRecord).toHaveBeenCalledWith(id, expect.objectContaining({ status: 'ready' }))
  })
  it('ignores legacy include_access_logs settings', async () => {
    mocks.getBackupSettings.mockResolvedValue({ include_access_logs: true, max_backups: 0 })
    const id = await create('full')
    expect(mocks.exportSurrealDb).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(await manifest(id)).toMatchObject({ included_tables: null, excluded_tables: [] })
  })
  it('records no exclusions if the access table is absent', async () => {
    mocks.listDatabaseTables.mockResolvedValue(['post', 'error_logs'])
    const id = await create('full')
    expect(mocks.exportSurrealDb).toHaveBeenCalledExactlyOnceWith(undefined)
    expect((await manifest(id)).excluded_tables).toEqual([])
  })
  it('leaves partial table selection unchanged, including explicitly selected access logs', async () => {
    const id = await create('partial', ['access_logs', 'post'])
    expect(mocks.exportSurrealDb).toHaveBeenCalledExactlyOnceWith({ tables: ['access_logs', 'post'] })
    expect(await manifest(id)).toMatchObject({ included_tables: ['access_logs', 'post'], excluded_tables: [] })
    expect(mocks.listDatabaseTables).not.toHaveBeenCalled()
  })
  it('preserves optional exclusion metadata when importing an external snapshot', async () => {
    const dbGzPath = join(mocks.root, 'external-db.gz')
    const mediaTarGzPath = join(mocks.root, 'external-media.gz')
    await writeFile(dbGzPath, gzipSync('external dump'))
    await writeFile(mediaTarGzPath, gzipSync('external media'))
    const { importExternalBackup } = await import('../../server/utils/backups/importExternal')
    const id = await importExternalBackup({ dbGzPath, mediaTarGzPath,
      manifestBuffer: Buffer.from(JSON.stringify({ excluded_tables: ['access_logs', 42, null] })) })
    expect((await manifest(id)).excluded_tables).toEqual(['access_logs'])
  })
  it('does not depend on the retired selection setting to export a full snapshot', async () => {
    mocks.getBackupSettings.mockRejectedValue(new Error('settings unavailable'))
    const id = await create('full')
    expect(mocks.exportSurrealDb).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(mocks.updateBackupRecord).toHaveBeenCalledWith(id, expect.objectContaining({ status: 'ready' }))
  })
})
