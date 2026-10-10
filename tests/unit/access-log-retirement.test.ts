import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ useDb: vi.fn(), queryDb: vi.fn(), queryDbRecord: vi.fn() }))
vi.mock('../../server/utils/db', () => db)
let directory: string | undefined
beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubGlobal('createError', createError)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: {} }))
  vi.stubEnv('LOG_CONSOLE', 'off')
  db.useDb.mockResolvedValue({})
  db.queryDb.mockResolvedValue([])
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

const retired = ['access_log_enabled', 'retention_access_days', 'excluded_paths', 'excluded_status_codes', 'sampling_rate']
describe('access-log retirement', () => {
  it('normalizes saved legacy keys without rewriting them at boot, and rejects retired PUT keys', async () => {
    const legacy = { enabled: true, activity_log_enabled: true, retention_access_days: 3650, sampling_rate: 0.1, excluded_paths: ['/custom'] }
    db.queryDb.mockResolvedValue([[{ value: legacy }]])
    const logging = await import('../../server/utils/logging')
    await logging.initializeLoggingSettings()
    expect(db.queryDb).toHaveBeenCalledOnce()
    expect(legacy.retention_access_days).toBe(3650)
    for (const key of retired) {
      expect(logging.getLoggingSettings()).not.toHaveProperty(key)
      expect(() => logging.validateLoggingSettingsUpdate({ [key]: true })).toThrow()
    }
    expect(() => logging.validateLoggingSettingsUpdate({ unknown: true })).toThrow()
    await logging.updateLoggingSettings({ retention_activity_days: 20 })
    const saved = db.queryDb.mock.calls.find(call => String(call[1]).includes('UPSERT'))?.[2].value
    for (const key of retired) expect(saved).not.toHaveProperty(key)
  })

  it.each([{ value: null }, { value: 'legacy-unparsed-settings' }, { value: ['legacy'] }])('keeps an existing malformed settings record %j untouched during boot', async ({ value }) => {
    db.queryDb.mockResolvedValue([[{ value }]])
    const logging = await import('../../server/utils/logging')
    expect(await logging.initializeLoggingSettings()).toMatchObject({ enabled: true, error_log_min_status: 500 })
    expect(db.queryDb).toHaveBeenCalledOnce() // read only, no automatic reset/duplicate cleanup
    expect(logging.getLoggingSettings()).not.toHaveProperty('retention_access_days')
  })

  it('leaves all access artifacts untouched during logging/settings/stats/retention, with no access SQL', async () => {
    directory = await mkdtemp(join(tmpdir(), 'pb-access-retired-'))
    vi.stubEnv('ACCESS_LOG_DIR', directory)
    const artifacts = {
      'access-2020-01-01.ndjson': '{partial',
      'access-2020-01-01.ndjson.gz': 'not gzip',
      '.index.json': 'old cache', '.migration-v1.json': 'unfinished receipt',
      'access-old.ndjson.migrating': 'source', 'access-buffer.ndjson.flushing': 'buffer', 'unknown': 'evidence'
    }
    for (const [name, content] of Object.entries(artifacts)) await writeFile(join(directory, name), content)
    db.queryDb.mockImplementation(async (_db, sql: string) => {
      if (sql.includes('WHERE key = $key')) return [[{ value: { enabled: true, activity_log_enabled: true, error_log_enabled: false } }]]
      if (sql.includes('RETURN array::len')) return [undefined, [], 0]
      return []
    })
    const logging = await import('../../server/utils/logging')
    await logging.initializeLoggingSettings()
    expect(logging).not.toHaveProperty('logAccess')
    logging.logActivity({ action: 'fixture', resource_type: 'test' })
    const stats = await logging.gatherLogStats()
    expect(stats).not.toHaveProperty('access')
    expect(stats).not.toHaveProperty('access_files_bytes')
    const { runLogRetention } = await import('../../server/utils/log-retention')
    const report = await runLogRetention()
    expect(report.deleted).not.toHaveProperty('access')
    expect(report.deleted).not.toHaveProperty('access_files')
    expect(db.queryDb.mock.calls.every(call => !/access_logs|__access_logs/.test(String(call[1])))).toBe(true)
    expect((await readdir(directory)).sort()).toEqual(Object.keys(artifacts).sort())
    for (const [name, content] of Object.entries(artifacts)) expect(await readFile(join(directory, name), 'utf8')).toBe(content)
  })

  it('rejects retired access via the shared parser, including generic detail/export/purge routes', async () => {
    const { parseLogType } = await import('../../server/utils/logging-admin')
    expect(() => parseLogType('access')).toThrow(expect.objectContaining({ statusCode: 404 }))
    expect(parseLogType('activity')).toBe('activity')
    expect(parseLogType('errors')).toBe('errors')
    expect(db.useDb).not.toHaveBeenCalled()
  })
})
