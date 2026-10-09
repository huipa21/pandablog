import { RecordId } from 'surrealdb'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteSnapshotFiles, normalizeBackupRecord, pruneBackups, replaceBackupRecords } from '../../../server/utils/backups/registry'
import { acquireSnapshotRead } from '../../../server/utils/backups/snapshotReads'
const mocks = vi.hoisted(() => ({root: '', queryDb: vi.fn(), useDb: vi.fn()}))
vi.mock('../../../server/utils/db', () => mocks)
vi.mock('../../../server/utils/backups/config', () => ({get BACKUPS_ROOT() {return mocks.root}}))
let rows: Record<string, unknown>[]
beforeEach(async () => {
  vi.resetAllMocks(); mocks.useDb.mockResolvedValue({})
  mocks.root = await mkdtemp(join(tmpdir(), 'pb-retention-owned-'))
  rows = ['new', 'middle', 'old'].map(id => ({id, type: 'full', status: 'ready'}))
  mocks.queryDb.mockImplementation(async (_db, sql) => sql.startsWith('SELECT') ? [rows] : [[]])
  for (const row of rows) {await mkdir(join(mocks.root, row.id as string)); await writeFile(join(mocks.root, row.id as string, 'db.surql.gz'), 'preserve')}
})
afterEach(async () => {await rm(mocks.root, {recursive: true, force: true})})
describe('full-only retention, preservation and snapshot read leases', () => {
  it('keeps newest configured ready full snapshots and deletes complete directories', async () => {
    expect(await pruneBackups(1)).toEqual(['backups:middle', 'backups:old'])
    expect(await readdir(mocks.root)).toEqual(['new'])
  })
  it('zero disables pruning and non-ready full records survive', async () => {
    expect(await pruneBackups(0)).toEqual([])
    rows[2]!.status = 'creating'
    expect(await pruneBackups(1)).toEqual(['backups:middle'])
    expect(await readdir(mocks.root)).toContain('old')
  })
  it.each([{type: 'incremental'}, {type: 'partial'}, {type: 'future'}, {type: undefined}, {type: 'full', parent: 'base'}, {type: 'full', included_tables: []}, {type: 'full', format_version: 1}])('preserves all bytes/rows and suspends automatic pruning for legacy evidence %j', async legacy => {
    rows[2] = {id: 'old', status: 'failed', ...legacy}
    expect(await pruneBackups(1)).toEqual([])
    expect(await readdir(mocks.root)).toEqual(['middle', 'new', 'old'])
    expect(await readFile(join(mocks.root, 'old', 'db.surql.gz'), 'utf8')).toBe('preserve')
    expect(mocks.queryDb.mock.calls.every(call => call[1].startsWith('SELECT'))).toBe(true)
  })
  it('skips active readers, refuses explicit unlink and releases only its own lease', async () => {
    const release = await acquireSnapshotRead('backups:old')
    try {
      expect(await pruneBackups(1)).toEqual(['backups:middle'])
      await expect(deleteSnapshotFiles('old')).rejects.toThrow(/readers/)
      expect(await readFile(join(mocks.root, 'old', 'db.surql.gz'), 'utf8')).toBe('preserve')
    } finally {release(); release()}
    expect(await pruneBackups(1)).toEqual(['backups:middle', 'backups:old'])
  })
  it('refuses unknown artifacts without unlinking any known components or falsely deleting the row', async () => {
    await writeFile(join(mocks.root, 'old', 'unknown'), 'evidence')
    await expect(pruneBackups(2)).rejects.toThrow(/Unknown/)
    expect(await readFile(join(mocks.root, 'old', 'db.surql.gz'), 'utf8')).toBe('preserve')
    expect(mocks.queryDb.mock.calls.some(call => call[1].startsWith('DELETE'))).toBe(false)
  })
  it('bounds reader admission at eight with no waiter map', async () => {
    const releases = await Promise.all(Array.from({length: 8}, (_, i) => acquireSnapshotRead(`fixture-${i}`)))
    try {await expect(acquireSnapshotRead('overflow')).rejects.toThrow()} finally {for (const release of releases) release()}
    const release = await acquireSnapshotRead('after'); release()
  })
  it('preserves native numeric legacy IDs rather than silently converting them to string IDs', async () => {
    const id = new RecordId('backups', 42)
    await replaceBackupRecords([normalizeBackupRecord({id, type: 'future', status: 'failed'})])
    const params = mocks.queryDb.mock.calls.at(-1)![2]
    expect(params.savedIds).toEqual([id])
    expect(params.id_0).toBe(42)
  })
  it('preserves raw unknown legacy indicators and additive bundle metadata during pre-wipe history reconciliation', async () => {
    const raw = {id: 'old', type: 'future', parent: 'base', status: 'ready', future_indicator: {selection: [42]}, bundle_sha256: 'a'.repeat(64)}
    await replaceBackupRecords([normalizeBackupRecord(raw)])
    const params = mocks.queryDb.mock.calls.at(-1)![2]
    expect(params.raw_0).toEqual({type: 'future', parent: 'base', status: 'ready', future_indicator: {selection: [42]}, bundle_sha256: 'a'.repeat(64)})
    expect(params.raw_0).not.toHaveProperty('id')
  })
})
