import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LOGGING_EXCLUDED_PATHS } from '../../utils/loggingSettings'

const mocks = vi.hoisted(() => ({
  queryDb: vi.fn(), useDb: vi.fn(), connectRootClient: vi.fn(), closeRootClient: vi.fn(),
  provisionAppDatabaseUser: vi.fn(), readFile: vi.fn(),
  initializeRuntimeSettings: vi.fn(), initializeAnalyticsSettings: vi.fn(), initializeSecuritySettings: vi.fn()
}))
vi.mock('../../server/utils/setup-authority', () => ({setupAuthority: () => ({status: async () => ({completed: true})})}))
vi.mock('../../server/utils/db', () => ({ ...mocks, queryDbRecord: vi.fn() }))
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }))
vi.mock('../../server/utils/settings', () => mocks)
vi.mock('../../server/utils/blocks', () => ({ flattenBlockSearchText: vi.fn(), flattenNodeText: vi.fn() }))
vi.mock('../../server/utils/searchTerms', () => ({ rebuildPostSearchTerms: vi.fn() }))
vi.mock('../../server/utils/taxonomy', () => ({ repairMisaddressedTaxonomyEdges: vi.fn() }))
vi.mock('../../server/utils/access-log-migration', () => ({ removeMigratedAccessTable: vi.fn(), runAccessLogMigration: vi.fn() }))

const markerKey = '__logging_excluded_paths_v2'
const rootDb = { name: 'root' }
const poolDb = { name: 'pool' }
const schema = '-- test schema'
let rows: Map<string, { value: unknown, updated_at?: string }>
let failLabel: string | undefined

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { modules: {} } }))
  vi.stubGlobal('__PB_MODULE_LOGS__', true)
  vi.stubGlobal('__PB_MODULE_ANALYTICS__', false)
  vi.stubGlobal('__PB_MODULE_BACKUPS__', false)
  vi.stubEnv('LOG_CONSOLE', 'off')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.connectRootClient.mockResolvedValue(rootDb)
  mocks.useDb.mockResolvedValue(poolDb)
  mocks.readFile.mockResolvedValue(schema)
  rows = new Map()
  failLabel = undefined
  mocks.queryDb.mockImplementation(async (_db, sql: string, params?: { key?: string, value?: unknown }, options?: { label: string }) => {
    if (options?.label === failLabel) throw new Error('migration query failed')
    if (options?.label === 'auth epoch migration page') return [[]] // unrelated users already migrated
    if (sql.startsWith('SELECT')) {
      if (params?.key === 'logging' || params?.key === markerKey) {
        const row = rows.get(params.key)
        return [row ? [structuredClone(row)] : []]
      }
      // All unrelated migrations are already marked; avoid their data/backfills.
      if (params?.key === '__schema_hash') return [[{ value: createHash('sha256').update(schema).digest('hex') }]]
      if (params?.key === '__media_storage_version') return [[{ value: '2026-05-image-variants-v2' }]]
      if (params?.key || sql.includes('FROM folder')) return [[{ value: 'already initialized' }]]
      if (options?.label === 'legacy app settings lookup') return [[]]
    }
    if (params?.key === 'logging' || params?.key === markerKey) {
      // The settings API also has a canonical-record duplicate cleanup.
      if (!sql.startsWith('DELETE')) {
        rows.set(params.key, { value: structuredClone(params.value), updated_at: new Date().toISOString() })
      }
      return [[]]
    }
    throw new Error(`Unexpected query: ${options?.label}`)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function boot() {
  const { default: plugin } = await import('../../server/plugins/db-init')
  await plugin({} as Parameters<typeof plugin>[0])
}

function migrationWrites(key: string) {
  return mocks.queryDb.mock.calls.filter(call => call[2]?.key === key && /^(CREATE|UPDATE)/.test(call[1]))
}

function storedSettings(): Record<string, unknown> {
  return rows.get('logging')?.value as Record<string, unknown>
}

describe('excluded-path defaults and reset', () => {
  it('shares the extended defaults with the admin form, returning independent arrays', async () => {
    const logging = await import('../../server/utils/logging')
    const first = logging.defaultLoggingSettings()
    const second = logging.defaultLoggingSettings()
    expect(first.excluded_paths).toEqual([
      '/_nuxt', '/favicon', '/api/admin/logs', '/api/health',
      '/api/analytics/track', '/_ipx', '/__nuxt_error', '/_i18n'
    ])
    expect(first.excluded_paths).toEqual([...DEFAULT_LOGGING_EXCLUDED_PATHS])
    expect(first.excluded_paths).not.toBe(second.excluded_paths)
    first.excluded_paths.push('/custom')
    expect(second.excluded_paths).not.toContain('/custom')
    expect(DEFAULT_LOGGING_EXCLUDED_PATHS).not.toContain('/custom')
  })

  it('persists the extended defaults on reset', async () => {
    rows.set('logging', { value: { excluded_paths: ['/custom'] } })
    const logging = await import('../../server/utils/logging')
    await logging.initializeLoggingSettings()
    expect(logging.getLoggingSettings().excluded_paths).toEqual(['/custom'])
    const reset = await logging.resetLoggingSettings()
    expect(reset.excluded_paths).toEqual([...DEFAULT_LOGGING_EXCLUDED_PATHS])
    expect(storedSettings().excluded_paths).toEqual(reset.excluded_paths)
    expect(rows.has(markerKey)).toBe(false)
  })
})

describe('boot-time excluded-path migration', () => {
  it('merges on the privileged boot connection, preserves other settings, and loads the merged cache', async () => {
    const original = {
      enabled: false, access_log_enabled: false, console_output: true, sampling_rate: 0.25,
      retention_access_days: 7, future_setting: { keep: true },
      excluded_paths: ['/custom', '/_nuxt', '/custom', '/favicon', '/api/admin/logs', '/_ipx']
    }
    rows.set('logging', { value: original })
    await boot()
    const expected = ['/custom', '/_nuxt', '/favicon', '/api/admin/logs', '/_ipx', '/api/health', '/api/analytics/track', '/__nuxt_error', '/_i18n']
    expect(storedSettings()).toEqual({ ...original, excluded_paths: expected })
    expect(original.excluded_paths).toEqual(['/custom', '/_nuxt', '/custom', '/favicon', '/api/admin/logs', '/_ipx'])
    expect(migrationWrites('logging')).toHaveLength(1)
    expect(migrationWrites(markerKey)).toHaveLength(1)
    expect(migrationWrites('logging')[0]?.[0]).toBe(rootDb)
    expect(migrationWrites(markerKey)[0]?.[0]).toBe(rootDb)
    expect(rows.get(markerKey)?.value).toEqual(expect.any(String))
    const calls = mocks.queryDb.mock.calls
    const markerWriteIndex = calls.findIndex(call => call[3]?.label === 'logging excluded paths migration marker create')
    expect(markerWriteIndex).toBeGreaterThan(calls.findIndex(call => call[3]?.label === 'logging excluded paths migration settings update'))
    expect(calls.findIndex(call => call[3]?.label === 'logging settings init')).toBeGreaterThan(markerWriteIndex)
    const logging = await import('../../server/utils/logging')
    expect(logging.getLoggingSettings().excluded_paths).toEqual(expected)
    expect(logging.getLoggingSettings().enabled).toBe(false)
    expect(mocks.closeRootClient).toHaveBeenCalledWith(rootDb)
  })

  it.each([undefined, null, 'invalid', [], 42])('initializes a fresh or invalid settings row (%j)', async (value) => {
    if (value !== undefined) rows.set('logging', { value })
    await boot()
    const logging = await import('../../server/utils/logging')
    expect(storedSettings()).toMatchObject({ ...logging.defaultLoggingSettings(), updated_at: expect.any(String) })
    expect(storedSettings().excluded_paths).toEqual([...DEFAULT_LOGGING_EXCLUDED_PATHS])
    expect(migrationWrites('logging')).toHaveLength(1)
    expect(rows.has(markerKey)).toBe(true)
  })

  it.each([undefined, null, '/bad-array', [], ['/custom', null, 1, '/custom']])('handles legacy missing/malformed excluded_paths (%j) without resetting other fields', async (excluded_paths) => {
    rows.set('logging', { value: { excluded_paths, sampling_rate: 0.5, future_setting: true } })
    await boot()
    expect(storedSettings()).toEqual({
      excluded_paths: Array.isArray(excluded_paths) && excluded_paths.length ? ['/custom', ...DEFAULT_LOGGING_EXCLUDED_PATHS] : [...DEFAULT_LOGGING_EXCLUDED_PATHS],
      sampling_rate: 0.5, future_setting: true
    })
  })

  it('skips marked databases and respects exclusions removed by an admin on subsequent boots', async () => {
    rows.set('logging', { value: { excluded_paths: ['/custom'] } })
    await boot()
    rows.set('logging', { value: { excluded_paths: ['/custom', '/_ipx'] } })
    mocks.queryDb.mockClear()
    await boot()
    expect(mocks.queryDb.mock.calls.filter(call => call[3]?.label.startsWith('logging excluded paths migration')))
      .toHaveLength(1) // Marker lookup only.
    expect(migrationWrites('logging')).toHaveLength(0)
    expect(migrationWrites(markerKey)).toHaveLength(0)
    const logging = await import('../../server/utils/logging')
    expect(logging.getLoggingSettings().excluded_paths).toEqual(['/custom', '/_ipx'])
  })

  it('refreshes a cache initialized before the boot migration', async () => {
    rows.set('logging', { value: { excluded_paths: ['/custom'] } })
    const logging = await import('../../server/utils/logging')
    await logging.initializeLoggingSettings()
    expect(logging.getLoggingSettings().excluded_paths).toEqual(['/custom'])
    await boot()
    expect(logging.getLoggingSettings().excluded_paths).toEqual(['/custom', ...DEFAULT_LOGGING_EXCLUDED_PATHS])
  })

  it('does not query or initialize logging when the logs module is disabled', async () => {
    vi.stubGlobal('__PB_MODULE_LOGS__', false)
    await boot()
    expect(mocks.queryDb.mock.calls.filter(call => call[2]?.key === 'logging' || call[2]?.key === markerKey)).toEqual([])
    expect(rows.has(markerKey)).toBe(false)
  })

  it.each([
    'logging excluded paths migration marker check',
    'logging excluded paths migration settings lookup',
    'logging excluded paths migration settings update',
    'logging excluded paths migration marker create'
  ])('never marks a failed migration and safely retries (%s)', async (label) => {
    rows.set('logging', { value: { excluded_paths: ['/custom'] } })
    failLabel = label
    await expect(boot()).rejects.toThrow('migration query failed')
    expect(rows.has(markerKey)).toBe(false)
    expect(mocks.closeRootClient).toHaveBeenCalledWith(rootDb)
    expect(mocks.queryDb.mock.calls.find(call => call[3]?.label === 'logging settings init')).toBeUndefined()
    failLabel = undefined
    await boot()
    expect(storedSettings().excluded_paths).toEqual(['/custom', ...DEFAULT_LOGGING_EXCLUDED_PATHS])
    expect(rows.has(markerKey)).toBe(true)
  })
})
