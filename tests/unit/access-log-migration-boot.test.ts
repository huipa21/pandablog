import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryDb: vi.fn(), useDb: vi.fn(), initializeRuntimeDatabase: vi.fn(),
  initializeRuntimeSettings: vi.fn(), initializeAnalyticsSettings: vi.fn(), initializeSecuritySettings: vi.fn(),
  reloadLoggingSettings: vi.fn(), getLoggingSettings: vi.fn(), defaultLoggingSettings: vi.fn(), writeConsoleEntry: vi.fn()
}))
// Component tests isolate boot migrations; actual lifecycle is covered separately.
vi.mock('../../server/utils/startup', () => ({startup: {status: () => ({ready: true}), initialize: async (work: () => Promise<void>) => {await work(); return true}}}))
vi.mock('../../server/utils/setup-authority', () => ({setupAuthority: () => ({status: async () => ({completed: true})})}))
// This logging fixture deliberately isolates unrelated media boot recovery.
vi.mock('../../server/utils/mediaLibrary', () => ({mediaRecoverInterruptedObjects: vi.fn(), mediaInitializeLegacyState: vi.fn()}))
vi.mock('../../server/utils/media-upload', () => ({mediaRecoverStageDirectories: vi.fn()}))
vi.mock('../../server/utils/db', () => mocks)
vi.mock('../../server/utils/settings', () => mocks)
vi.mock('../../server/utils/logging', () => mocks)
vi.mock('../../server/utils/log-console', async (original) => ({ ...await original<typeof import('../../server/utils/log-console')>(), writeConsoleEntry: mocks.writeConsoleEntry }))
vi.mock('../../server/utils/schema', () => ({ loadSchema: vi.fn(async () => ({ schema: '', hash: 'hash' })), applySchema: vi.fn(), SCHEMA_HASH_KEY: '__schema_hash' }))
vi.mock('../../server/utils/blocks', () => ({ flattenBlockSearchText: vi.fn(), flattenNodeText: vi.fn() }))
vi.mock('../../server/utils/searchTerms', () => ({ rebuildPostSearchTerms: vi.fn() }))
vi.mock('../../server/utils/taxonomy', () => ({ repairMisaddressedTaxonomyEdges: vi.fn() }))
const poolDb = { identity: 'EDITOR' }
const checkpointKey = '__access_logs_to_files_v1'
const exportedKey = '__access_logs_exported_v1'
const removedKey = '__access_logs_table_removed_v1'
let dir: string
let markers: Map<string, unknown>
let source: Record<string, unknown>[]
let table: boolean
let failLabel: string | undefined
let modules: Record<string, unknown>
const row = (id: string) => ({ id: `access_logs:${id}`, request_id: id, timestamp: new Date(), method: 'GET', path: `/posts/${id}`, status_code: 200, response_time_ms: 12 })
beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  dir = await mkdtemp(join(tmpdir(), 'pb-access-migration-boot-'))
  // Both the override and the fixed legacy storage/logs path must be disposable.
  vi.spyOn(process, 'cwd').mockReturnValue(dir)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('ACCESS_LOG_DIR', dir)
  vi.stubEnv('LOG_CONSOLE', 'off')
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  vi.stubGlobal('__PB_MODULE_LOGS__', true)
  vi.stubGlobal('__PB_MODULE_ANALYTICS__', false)
  modules = {}
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules } }))
  markers = new Map()
  source = [row('one'), row('two')]
  table = true
  failLabel = undefined
  mocks.initializeRuntimeDatabase.mockResolvedValue(poolDb)
  mocks.useDb.mockResolvedValue(poolDb)
  mocks.getLoggingSettings.mockReturnValue({ retention_access_days: 30, redact_fields: ['password', 'token'], max_metadata_size_kb: 50 })
  mocks.queryDb.mockImplementation(async (db, sql: string, params?: Record<string, unknown>, options?: { label: string }) => {
    if (options?.label === failLabel) throw new Error('injected query failure')
    if (options?.label === 'auth epoch migration page') return [[]] // unrelated users already migrated
    if (sql === 'INFO FOR DB;') return [{ tables: table ? { access_logs: 'schemafull' } : {} }]
    if (sql === 'REMOVE TABLE access_logs;') {
      expect(db).toBe(poolDb)
      table = false
      return [[]]
    }
    if (options?.label === 'access migration reset after restore') {
      for (const key of params!.keys as string[]) markers.delete(key)
      return [[]]
    }
    if (options?.label === 'access migration export page') {
      expect(db).toBe(poolDb)
      const start = params?.cursor_id ? source.findIndex(value => value.id === `access_logs:${params.cursor_id}`) + 1 : 0
      return [source.slice(start, start + Number(params?.limit))]
    }
    if (typeof params?.key === 'string' && params.key.startsWith('__access_logs')) {
      if (sql.startsWith('SELECT')) return [markers.has(params.key) ? [{ value: structuredClone(markers.get(params.key)) }] : []]
      if (sql.startsWith('UPSERT')) markers.set(params.key, structuredClone(params.value))
      return [[]]
    }
    if (options?.label === 'legacy app settings lookup') return [[]]
    if (params?.key === '__schema_hash') return [[{ value: 'hash' }]]
    if (params?.key === '__media_storage_version') return [[{ value: '2026-05-image-variants-v2' }]]
    // Unrelated boot/backfill migrations are already complete.
    return [[{ value: true }]]
  })
})
afterEach(async () => {
  await (await import('../../server/utils/access-log-store')).closeAccessLogStore()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})
async function boot() {
  const { default: plugin } = await import('../../server/plugins/db-init')
  await plugin({} as Parameters<typeof plugin>[0])
}
async function exported() { await vi.waitFor(() => expect(markers.has(exportedKey)).toBe(true)) }
function removalCalls() { return mocks.queryDb.mock.calls.filter(call => call[1] === 'REMOVE TABLE access_logs;') }
async function fileRows() {
  const file = (await readdir(dir)).find(name => name.endsWith('.ndjson'))!
  return (await readFile(join(dir, file), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
}

describe('real db-init two-phase migration with isolated mocked DB', () => {
  it('exports through EDITOR without blocking boot, then drops only on the next owned EDITOR boot', async () => {
    await boot()
    await exported()
    expect(table).toBe(true)
    expect(removalCalls()).toHaveLength(0)
    expect((await fileRows()).map(value => value.id)).toEqual(['one', 'two'])
    const page = mocks.queryDb.mock.calls.find(call => call[3]?.label === 'access migration export page')!
    expect(page[1]).toContain('WITH NOINDEX')
    expect(page[1]).toContain('ORDER BY timestamp ASC, id ASC LIMIT $limit')
    expect(page[1]).not.toContain('START')
    expect(page[2].limit).toBe(5000)
    expect(page[3]).toMatchObject({ retryOnReconnect: false, timeoutMs: 30_000 })
    expect(mocks.initializeRuntimeDatabase).toHaveBeenCalled()
    await boot()
    expect(removalCalls()).toHaveLength(1)
    expect(table).toBe(false)
    expect(markers.has(removedKey)).toBe(true)
    const count = mocks.queryDb.mock.calls.filter(call => call[3]?.label === 'access migration export page').length
    await boot()
    expect(removalCalls()).toHaveLength(1)
    expect(mocks.queryDb.mock.calls.filter(call => call[3]?.label === 'access migration export page')).toHaveLength(count)
  })
  it('uses a timestamp-plus-record-ID cursor on subsequent pages', async () => {
    const timestamp = new Date()
    source = Array.from({ length: 5001 }, (_, index) => ({ ...row(`id-${index}`), timestamp }))
    await boot()
    await exported()
    const pages = mocks.queryDb.mock.calls.filter(call => call[3]?.label === 'access migration export page')
    expect(pages[1]![1]).toContain("id > type::record('access_logs', $cursor_id)")
    expect(pages[1]![2]).toMatchObject({ cursor_ts: timestamp.toISOString(), cursor_id: 'id-4999' })
    expect(await fileRows()).toHaveLength(5001)
  })
  it('retains sources and retries export/checkpoint failures on a later boot', async () => {
    failLabel = `access migration save ${checkpointKey}`
    await boot()
    await vi.waitFor(() => expect(mocks.writeConsoleEntry).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', kind: 'app' }), expect.anything()))
    expect(markers.has(exportedKey)).toBe(false)
    expect(table).toBe(true)
    expect(removalCalls()).toHaveLength(0)
    failLabel = undefined
    await boot()
    await exported()
    expect(await fileRows()).toHaveLength(2)
  })
  it('fails closed on missing receipts/changed mounts before owned table removal', async () => {
    await boot()
    await exported()
    await rm(join(dir, '.migration-v1.json'))
    await expect(boot()).rejects.toThrow()
    expect(removalCalls()).toHaveLength(0)
    expect(table).toBe(true)
    expect(mocks.initializeRuntimeDatabase).toHaveBeenCalled()
  })
  it('does not drop until export is complete and safely retries REMOVE failures', async () => {
    await boot()
    await exported()
    failLabel = 'access migration remove table'
    await expect(boot()).rejects.toThrow('injected query failure')
    expect(markers.has(removedKey)).toBe(false)
    expect(table).toBe(true)
    failLabel = undefined
    await boot()
    expect(table).toBe(false)
    expect(markers.has(removedKey)).toBe(true)
  })
  it('recovers a crash after REMOVE but before the removal marker without needing a receipt', async () => {
    await boot()
    await exported()
    failLabel = `access migration save ${removedKey}`
    await expect(boot()).rejects.toThrow('injected query failure')
    expect(table).toBe(false)
    expect(markers.has(removedKey)).toBe(false)
    await rm(join(dir, '.migration-v1.json'))
    failLabel = undefined
    await boot()
    expect(markers.has(removedKey)).toBe(true)
    expect(removalCalls()).toHaveLength(1)
  })
  it('reexports a restored legacy table rather than trusting old removal markers', async () => {
    await boot()
    await exported()
    await boot()
    table = true
    source = [row('restored')]
    await boot()
    await exported()
    expect(table).toBe(true)
    expect(removalCalls()).toHaveLength(1)
    expect((await fileRows()).map(value => value.id).sort()).toEqual(['one', 'restored', 'two'])
    await boot()
    expect(table).toBe(false)
    expect(removalCalls()).toHaveLength(2)
  })
  it('marks fresh installations complete without querying or dropping a nonexistent access table', async () => {
    table = false
    await boot()
    await exported()
    expect(mocks.queryDb.mock.calls.filter(call => call[3]?.label === 'access migration export page')).toHaveLength(0)
    await boot()
    expect(markers.has(removedKey)).toBe(true)
    expect(removalCalls()).toHaveLength(0)
  })
  it.each(['build', 'runtime-logs', 'runtime-access'])('does no migration/file/removal work when disabled (%s)', async mode => {
    if (mode === 'build') vi.stubGlobal('__PB_MODULE_LOGS__', false)
    else modules = { logs: mode === 'runtime-logs' ? { enabled: false } : { accessLogs: false } }
    await boot()
    await new Promise(resolve => setTimeout(resolve, 25))
    expect(mocks.queryDb.mock.calls.filter(call => call[3]?.label.startsWith('access migration'))).toHaveLength(0)
    expect(markers.size).toBe(0)
    expect(await readdir(dir)).toEqual([])
  })
})
