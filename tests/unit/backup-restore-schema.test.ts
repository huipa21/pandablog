import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getBackup: vi.fn(), listBackups: vi.fn(), replaceBackupRecords: vi.fn(), updateBackupRecord: vi.fn(), wipeDatabase: vi.fn(),
  acquireJob: vi.fn(), releaseJob: vi.fn(), updateJobProgress: vi.fn(),
  exportSurrealDbToBuffer: vi.fn(), importSurrealDb: vi.fn(), validateDumpByStaging: vi.fn(), consolidateDumps: vi.fn(),
  clearDirectory: vi.fn(), extractMediaTar: vi.fn(), getBackupSettings: vi.fn(), getMediaSettings: vi.fn(),
  initializeRuntimeSettings: vi.fn(), initializeLoggingSettings: vi.fn(), queryDb: vi.fn(), useDb: vi.fn(),
  connectRootClient: vi.fn(), closeRootClient: vi.fn(), applySchema: vi.fn(),
  readFile: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn(), rm: vi.fn(), rename: vi.fn(),
  rebuildPostSearchTerms: vi.fn()
}))
vi.mock('../../server/utils/backups/registry', () => ({ ...mocks, backupIdPart: (id: string) => id.replace(/^backups:/, '') }))
vi.mock('../../server/utils/backups/jobMutex', () => mocks)
vi.mock('../../server/utils/backups/surrealHttp', () => mocks)
vi.mock('../../server/utils/backups/validate', () => mocks)
vi.mock('../../server/utils/backups/tarStream', () => mocks)
vi.mock('../../server/utils/settings', () => mocks)
vi.mock('../../server/utils/logging', () => mocks)
vi.mock('../../server/utils/db', () => mocks)
vi.mock('../../server/utils/schema', () => ({ applySchema: mocks.applySchema, SCHEMA_HASH_KEY: '__schema_hash' }))
vi.mock('../../server/utils/searchTerms', () => mocks)
vi.mock('../../server/utils/mediaLibrary', () => ({ mediaNormalizeFileRecord: vi.fn() }))
vi.mock('../../server/utils/imageProcessor', () => ({ mediaProcessImageBuffer: vi.fn() }))
vi.mock('node:fs/promises', () => mocks)
vi.mock('node:fs', () => ({ existsSync: () => false }))

const root = { name: 'root' }
const pool = { name: 'pool' }
const record = { id: 'backups:fixture', type: 'full', status: 'ready', parent: null }
beforeEach(() => {
  vi.resetAllMocks()
  for (const mock of Object.values(mocks)) mock.mockResolvedValue(undefined)
  mocks.getBackup.mockResolvedValue(record)
  mocks.listBackups.mockResolvedValue([record])
  mocks.getBackupSettings.mockResolvedValue({ validate_before_restore: true, auto_safety_snapshot: false })
  mocks.getMediaSettings.mockResolvedValue({})
  mocks.readFile.mockResolvedValue(gzipSync('dump with current schema hash'))
  mocks.useDb.mockResolvedValue(pool)
  mocks.connectRootClient.mockResolvedValue(root)
  mocks.queryDb.mockImplementation(async (_db, sql) => sql === 'INFO FOR DB;' ? [{ tables: { post: 'definition' } }] : [[]])
  vi.stubGlobal('createError', (error: { message: string }) => new Error(error.message))
})
afterEach(() => vi.unstubAllGlobals())

async function restore() {
  const { startRestoreJob } = await import('../../server/utils/backups/restore')
  await startRestoreJob('fixture')
  await vi.waitFor(() => expect(mocks.releaseJob).toHaveBeenCalledOnce())
}

describe('restore schema repair', () => {
  it.each(['full', 'incremental', 'partial'])('reapplies the schema for %s before history/caches/job release', async type => {
    mocks.getBackup.mockResolvedValue({ ...record, type, parent: type === 'partial' ? 'base' : null })
    mocks.listBackups.mockResolvedValue([record, { ...record, id: 'backups:base' }])
    mocks.consolidateDumps.mockReturnValue(Buffer.from('consolidated'))
    await restore()
    expect(mocks.applySchema).toHaveBeenCalledExactlyOnceWith(root)
    const hashDelete = mocks.queryDb.mock.calls.find(call => call[3]?.label === 'restore schema hash invalidation')!
    expect(hashDelete).toEqual([root, 'DELETE app_settings WHERE key = $key;', { key: '__schema_hash' }, {
      label: 'restore schema hash invalidation', timeoutMs: 10_000, retryOnReconnect: false
    }])
    const order = mocks.applySchema.mock.invocationCallOrder[0]!
    expect(order).toBeGreaterThan(mocks.importSurrealDb.mock.invocationCallOrder[0]!)
    const verifyIndex = mocks.queryDb.mock.calls.findIndex(call => call[3]?.label === 'verify restore')
    const invalidateIndex = mocks.queryDb.mock.calls.findIndex(call => call[3]?.label === 'restore schema hash invalidation')
    expect(invalidateIndex).toBeGreaterThan(verifyIndex)
    expect(order).toBeLessThan(mocks.replaceBackupRecords.mock.invocationCallOrder[0]!)
    expect(order).toBeLessThan(mocks.initializeRuntimeSettings.mock.invocationCallOrder[0]!)
    expect(order).toBeLessThan(mocks.releaseJob.mock.invocationCallOrder[0]!)
    expect(mocks.closeRootClient).toHaveBeenCalledExactlyOnceWith(root)
    expect(mocks.updateBackupRecord).toHaveBeenLastCalledWith('fixture', expect.objectContaining({ status: 'ready', error: null }))
  })
  it('does not repair a failed/empty import or report success', async () => {
    mocks.queryDb.mockResolvedValue([{ tables: {} }])
    await restore()
    expect(mocks.applySchema).not.toHaveBeenCalled()
    expect(mocks.connectRootClient).not.toHaveBeenCalled()
    expect(mocks.updateBackupRecord).toHaveBeenLastCalledWith('fixture', expect.objectContaining({ status: 'failed' }))
  })
  it('closes the privileged connection and rolls back if schema application fails', async () => {
    mocks.getBackupSettings.mockResolvedValue({ validate_before_restore: true, auto_safety_snapshot: true })
    mocks.exportSurrealDbToBuffer.mockResolvedValue(Buffer.from('safety'))
    mocks.applySchema.mockRejectedValue(new Error('schema failure'))
    await restore()
    expect(mocks.closeRootClient).toHaveBeenCalledExactlyOnceWith(root)
    expect(mocks.wipeDatabase).toHaveBeenCalledTimes(2)
    expect(mocks.importSurrealDb).toHaveBeenCalledTimes(2)
    expect(mocks.updateBackupRecord).toHaveBeenLastCalledWith('fixture', {
      status: 'ready', error: 'schema failure — restore was rolled back to the pre-restore state.'
    })
  })
  it('does not apply the schema if invalidating the hash fails', async () => {
    mocks.queryDb.mockImplementation(async (_db, sql) => {
      if (sql.startsWith('DELETE app_settings')) throw new Error('hash failure')
      return [{ tables: { post: 'definition' } }]
    })
    await restore()
    expect(mocks.applySchema).not.toHaveBeenCalled()
    expect(mocks.closeRootClient).toHaveBeenCalledExactlyOnceWith(root)
    expect(mocks.updateBackupRecord).toHaveBeenLastCalledWith('fixture', expect.objectContaining({ status: 'failed', error: expect.stringContaining('hash failure') }))
  })
})
