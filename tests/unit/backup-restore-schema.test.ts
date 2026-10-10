import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getBackup: vi.fn(), listBackups: vi.fn(), replaceBackupRecords: vi.fn(), updateBackupRecord: vi.fn(), wipeDatabase: vi.fn(),
  acquireJob: vi.fn(), releaseJob: vi.fn(), updateJobProgress: vi.fn(), syncDirectory: vi.fn(), transition: vi.fn(), beginRestore: vi.fn(),
  exportSurrealDbToFile: vi.fn(), importSurrealDb: vi.fn(), validateDumpByStaging: vi.fn(), verifyFullComponents: vi.fn(), verifyReadyBundle: vi.fn(), verifySnapshot: vi.fn(), sha256File: vi.fn(),
  collectOriginalPaths: vi.fn(), extractMediaTar: vi.fn(), expandDump: vi.fn(), checkDisk: vi.fn(), regularFile: vi.fn(),
  getBackupSettings: vi.fn(), getMediaSettings: vi.fn(), initializeRuntimeSettings: vi.fn(), initializeAnalyticsSettings: vi.fn(), initializeSecuritySettings: vi.fn(), reloadLoggingSettings: vi.fn(),
  queryDb: vi.fn(), connectRootClient: vi.fn(), closeRootClient: vi.fn(), provisionAppDatabaseUser: vi.fn(), recycleRuntimeConnection: vi.fn(), applySchema: vi.fn(),
  mkdir: vi.fn(), rm: vi.fn(), rename: vi.fn(), lstat: vi.fn(), clear: vi.fn()
}))
vi.mock('../../server/utils/backups/registry', () => ({...mocks, backupIdPart: (id: string) => id.replace(/^backups:/, '')}))
vi.mock('../../server/utils/backups/jobMutex', () => ({...mocks, jobStore: {...mocks, recoveryRequired: () => false}}))
vi.mock('../../server/utils/backups/surrealHttp', () => mocks)
vi.mock('../../server/utils/backups/validate', () => mocks)
vi.mock('../../server/utils/backups/snapshot', () => mocks)
vi.mock('../../server/utils/backups/tarStream', () => mocks)
vi.mock('../../server/utils/backups/streams', () => ({...mocks, BACKUP_LIMITS: {sqlBytes: 100}}))
vi.mock('../../server/utils/settings', () => mocks)
vi.mock('../../server/utils/logging', () => mocks)
vi.mock('../../server/utils/db', () => mocks)
vi.mock('../../server/utils/schema', () => mocks)
vi.mock('../../server/utils/imageProcessor', () => ({mediaProcessImageFile: vi.fn()}))
vi.mock('../../server/utils/users', () => ({newAuthEpoch: () => 'a'.repeat(48)}))
vi.mock('node:fs/promises', () => mocks) // absolutely no configured FS operations

const root = {name: 'dedicated-root'}
const record = {id: 'backups:fixture', type: 'full', status: 'ready', parent: null, chain_root: null, included_tables: null, included_hashes: [], media_file_count: 0, manifest_sha256_db: 'checksum', manifest_sha256_media: 'checksum'}
const owner = {...record, kind: 'restore', token: 'a'.repeat(48), generation: 'b'.repeat(48), startedAt: new Date().toISOString()}

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  for (const mock of Object.values(mocks)) mock.mockResolvedValue(undefined)
  mocks.getBackup.mockResolvedValue(record)
  mocks.listBackups.mockResolvedValue([record])
  mocks.getBackupSettings.mockResolvedValue({auto_safety_snapshot: true})
  mocks.connectRootClient.mockResolvedValue(root)
  mocks.sha256File.mockResolvedValue('checksum')
  mocks.verifyFullComponents.mockResolvedValue({db: 'fixture-db.gz', media: 'fixture-media.gz'})
  mocks.extractMediaTar.mockResolvedValue(0)
  mocks.collectOriginalPaths.mockResolvedValue([])
  mocks.lstat.mockResolvedValue({isDirectory: () => true})
  mocks.validateDumpByStaging.mockResolvedValue({post: {count: 1, sample: 'synthetic'}})
  mocks.queryDb.mockImplementation(async (_db, sql: string) => sql.includes('FROM users:admin') ? [[{id: 'users:admin'}]] : [[]])
  vi.stubGlobal('useStorage', () => ({clear: mocks.clear}))
})
afterEach(() => vi.unstubAllGlobals())
async function run() {
  const {writeBarrier} = await import('../../server/utils/maintenance')
  const {runRestoreWork} = await import('../../server/utils/backups/restore')
  await writeBarrier.close(owner)
  await writeBarrier.runOwner(owner, () => runRestoreWork(owner as never, record as never))
  return writeBarrier.status()
}

describe('journaled restore consistency and failure boundaries (synthetic work, real barrier)', () => {
  it.each(['incremental', 'partial', 'future', null])('rejects unsupported type %s before job/journal/fence', async type => {
    mocks.getBackup.mockResolvedValue({...record, type})
    const {startRestoreJob} = await import('../../server/utils/backups/restore')
    await expect(startRestoreJob('fixture')).rejects.toMatchObject({statusCode: 409})
    expect(mocks.acquireJob).not.toHaveBeenCalled()
    expect(mocks.beginRestore).not.toHaveBeenCalled()
    expect(mocks.wipeDatabase).not.toHaveBeenCalled()
  })
  it('verifies safety before wipe, repairs using ROOT without destructive schema reset, then publishes/revokes/refreshes before release', async () => {
    expect((await run()).closed).toBe(false)
    expect(mocks.exportSurrealDbToFile.mock.invocationCallOrder[0]).toBeLessThan(mocks.wipeDatabase.mock.invocationCallOrder[0]!)
    expect(mocks.applySchema).toHaveBeenCalledExactlyOnceWith(root, undefined, {preserveData: true})
    expect(mocks.provisionAppDatabaseUser).toHaveBeenCalledWith(root)
    expect(mocks.recycleRuntimeConnection).toHaveBeenCalledOnce()
    expect(mocks.verifySnapshot).toHaveBeenCalledOnce()
    expect(mocks.clear).toHaveBeenCalledOnce()
    const commit = mocks.transition.mock.calls.findIndex(call => call[1].state === 'committed')
    expect(commit).toBeGreaterThan(0)
    expect(mocks.releaseJob).toHaveBeenCalledExactlyOnceWith(owner)
  })
  it.each(['verifyFullComponents', 'expandDump', 'extractMediaTar', 'validateDumpByStaging', 'exportSurrealDbToFile'] as const)('aborts %s failure without wipe or unnecessary rollback', async key => {
    mocks[key].mockRejectedValueOnce(new Error('preflight failure'))
    expect((await run()).closed).toBe(false)
    expect(mocks.wipeDatabase).not.toHaveBeenCalled()
    expect(mocks.transition).toHaveBeenLastCalledWith(owner, expect.objectContaining({state: 'aborted'}))
  })
  it('preserves a pre-existing unowned restore stage when exclusive mkdir fails', async () => {
    mocks.mkdir.mockRejectedValueOnce(Object.assign(new Error('existing unknown stage'), {code: 'EEXIST'}))
    expect((await run()).closed).toBe(false)
    expect(mocks.rm).not.toHaveBeenCalled()
    expect(mocks.wipeDatabase).not.toHaveBeenCalled()
    expect(mocks.transition).toHaveBeenLastCalledWith(owner, expect.objectContaining({state: 'aborted'}))
  })
  it('pre-destructive metadata failure cannot become expert recovery', async () => {
    mocks.validateDumpByStaging.mockRejectedValueOnce(new Error('preflight failure'))
    mocks.updateBackupRecord.mockRejectedValueOnce(new Error('ordinary uncertain metadata write'))
    expect((await run()).closed).toBe(false)
    expect(mocks.wipeDatabase).not.toHaveBeenCalled()
    expect(mocks.transition).toHaveBeenLastCalledWith(owner, expect.objectContaining({state: 'aborted', destructive: false}))
  })
  it('requires safety even when the legacy operator setting disabled it', async () => {
    mocks.getBackupSettings.mockResolvedValue({auto_safety_snapshot: false})
    await run()
    expect(mocks.wipeDatabase).not.toHaveBeenCalled()
  })
  it.each(['wipeDatabase', 'importSurrealDb', 'verifySnapshot', 'applySchema', 'replaceBackupRecords', 'initializeRuntimeSettings'] as const)('rolls back and verifies both generations after known %s failure', async key => {
    mocks[key].mockRejectedValueOnce(new Error('injected cutover failure'))
    expect((await run()).closed).toBe(false)
    expect(mocks.wipeDatabase).toHaveBeenCalledTimes(2)
    expect(mocks.transition).toHaveBeenLastCalledWith(owner, expect.objectContaining({state: 'rolled-back'}))
    if (key === 'initializeRuntimeSettings') {
      expect(mocks.rename.mock.calls.some(call => String(call[0]).endsWith('old-uploads'))).toBe(true)
      expect(mocks.rename.mock.calls.some(call => String(call[0]).endsWith('old-variants'))).toBe(true)
    }
  })
  it('does not replay/rollback an ambiguous cutover or delete safety artifacts', async () => {
    mocks.importSurrealDb.mockRejectedValueOnce(Object.assign(new Error('transport ambiguity'), {uncertain: true}))
    expect((await run()).closed).toBe(true)
    expect(mocks.wipeDatabase).toHaveBeenCalledOnce()
    expect(mocks.releaseJob).not.toHaveBeenCalled()
    expect(mocks.rm).not.toHaveBeenCalled()
    expect(mocks.transition).toHaveBeenLastCalledWith(owner, expect.objectContaining({state: 'recovery-required'}))
  })
  it('rollback failure stays fenced and cannot be overwritten by later metadata success', async () => {
    mocks.importSurrealDb.mockRejectedValue(new Error('known failed import'))
    expect((await run()).closed).toBe(true)
    expect(mocks.releaseJob).not.toHaveBeenCalled()
    expect(mocks.updateBackupRecord).not.toHaveBeenCalled()
    expect(mocks.rm).not.toHaveBeenCalled()
  })
})
