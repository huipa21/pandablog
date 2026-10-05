import { queryDb, type useDb } from './db'
import { firstRow } from './surrealResult'

export const MEDIA_STORAGE_VERSION_KEY = '__media_storage_version'
export const MEDIA_STORAGE_VERSION = '2026-05-image-variants-v2'
type Database = Awaited<ReturnType<typeof useDb>>

/** Read-only preflight MUST run before SCHEMAFULL synchronization/backfills. */
export async function assertMediaStorageCompatible(db: Database): Promise<boolean> {
  const response = await readExistingTable(db, 'app_settings',
    'SELECT `value` FROM app_settings WHERE key = $key LIMIT 1;',
    { key: MEDIA_STORAGE_VERSION_KEY })
  const marker = firstRow<{ value?: unknown }>(response)
  if (marker?.value === MEDIA_STORAGE_VERSION) return false

  let hasMedia = false
  for (const table of ['files', 'media', 'asset'] as const) {
    const rows = await readExistingTable(db, table, `SELECT id FROM ${table} LIMIT 1;`)
    hasMedia ||= Boolean(firstRow(rows))
  }
  // Only a genuinely fresh (unmarked, empty) library may initialize. No known
  // historical converter exists yet; absence of evidence is not compatibility.
  if (!marker && !hasMedia) return true
  throw new Error('Unsupported or missing media storage layout marker. All media records, originals and settings are preserved. Stop the writer; verify a backup and rehearse a layout-specific migration on an approved isolated copy. Do not bypass this check by changing the marker. See docs/backend-hardening/operations.md.')
}

async function readExistingTable(db: Database, table: string, sql: string, params?: Record<string, unknown>) {
  try {
    return await queryDb(db, sql, params,
      { label: 'media layout preflight', timeoutMs: 5_000, retryOnReconnect: false })
  } catch (error) {
    // SurrealDB 3.2 rejects SELECT against absent tables. Only this exact
    // absence is empty, never permissions, connection or arbitrary SQL errors.
    if (error instanceof Error && error.message === `The table '${table}' does not exist`) return [[]]
    throw error
  }
}

/** Only fresh initialization writes; failure/reentry cannot reset settings. */
export async function ensureMediaStorageVersion(db: Database): Promise<void> {
  if (!await assertMediaStorageCompatible(db)) return
  await queryDb(db, `UPSERT type::record('app_settings', $key) CONTENT {
    key: $key, value: $value, updated_at: time::now()
  };`, { key: MEDIA_STORAGE_VERSION_KEY, value: MEDIA_STORAGE_VERSION },
  { label: 'fresh media layout initialization', timeoutMs: 10_000, retryOnReconnect: false })
}
