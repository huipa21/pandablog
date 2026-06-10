import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { queryDb, useDb } from '../utils/db'
import { initializeLoggingSettings } from '../utils/logging'
import { initializeRuntimeSettings } from '../utils/settings'
import { firstRow, queryRows, stringifyRecordId } from '../utils/surrealResult'
import { ADMIN_LOCALE_KEY, DEFAULT_ADMIN_LOCALE } from '~/utils/adminLocale'
import { computeContentStats } from '~/utils/contentStats'
import {
  ADMIN_DATE_FORMAT_KEY,
  ADMIN_FORMAT_LOCALE_KEY,
  ADMIN_TIMEZONE_KEY,
  DEFAULT_ADMIN_DATE_FORMAT,
  DEFAULT_ADMIN_FORMAT_LOCALE,
  DEFAULT_ADMIN_TIMEZONE
} from '~/utils/systemSettings'
import { ADMIN_COLOR_MODE_KEY, DEFAULT_ADMIN_COLOR_MODE } from '~/utils/themeMode'

const SCHEMA_HASH_KEY = '__schema_hash'
const USER_TABLE_MIGRATION_KEY = '__user_table_migration_v1'
const POST_STATS_BACKFILL_KEY = '__post_stats_backfill_v1'
const MEDIA_STORAGE_VERSION_KEY = '__media_storage_version'
const APP_SETTINGS_TABLE = 'app_settings'
const LEGACY_APP_SETTINGS_TABLE = `app_${'setting'}`
const MEDIA_STORAGE_VERSION = '2026-05-image-variants-v2'
const DEFAULT_MEDIA_SETTINGS = {
  allowed_extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'mp4', 'webm', 'mov', 'zip', 'rar', '7z'],
  max_file_size_mb: 10,
  max_files_per_upload: 5,
  enable_perceptual_dedup: false,
  perceptual_dedup_threshold: 5,
  download_cleanup_hours: 1,
  public_base_url: '',
  local_only: false,
  orphan_cleanup_enabled: false,
  orphan_cleanup_days: 30,
  orphan_cleanup_cron: '0 4 * * *'
}

export default defineNitroPlugin(async () => {
  try {
    const db = await useDb()
    await migrateLegacyAppSettingsTable(db)
    const schema = await readFile(resolve(process.cwd(), 'server/utils/schema.surql'), 'utf8')
    const schemaHash = createHash('sha256').update(schema).digest('hex')

    if (!await hasCurrentSchemaHash(db, schemaHash)) {
      await resetPostStatsFieldDefinitionsBeforeSchema(db)
      await queryDb(db, schema, undefined, { label: 'schema initialization', timeoutMs: 30_000 })
      await setAppSetting(db, SCHEMA_HASH_KEY, schemaHash, 'schema hash update')
    }

    await ensureUserTableMigration(db)
    await ensureMediaStorageVersion(db)
    await ensureDefaultMediaSettings(db)
    await ensureDefaultAdminColorMode(db)
    await ensureDefaultAdminLocale(db)
    await ensureDefaultAdminRegionalSettings(db)
    await initializeRuntimeSettings(true)
    await ensureDefaultFolder(db)
    await backfillPostStats(db)
    await initializeLoggingSettings()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[db-init] FATAL: database initialization failed:', message)
    if (error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    throw error
  }
})

async function hasCurrentSchemaHash(db: Awaited<ReturnType<typeof useDb>>, schemaHash: string) {
  try {
    const response = await queryDb<[Array<{ value?: string }> ]>(
      db,
      'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
      { key: SCHEMA_HASH_KEY },
      { label: 'schema hash lookup', timeoutMs: 5_000 }
    )

    return firstRow<{ value?: string }>(response)?.value === schemaHash
  } catch {
    return false
  }
}

async function ensureDefaultMediaSettings(db: Awaited<ReturnType<typeof useDb>>) {
  const mediaSettings = await queryDb<[Array<{ value?: unknown }> ]>(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key: 'media' },
    { label: 'media settings lookup', timeoutMs: 10_000 }
  )

  if (firstRow(mediaSettings)) {
    return
  }

  await setAppSetting(db, 'media', DEFAULT_MEDIA_SETTINGS, 'media settings init')
}

async function ensureUserTableMigration(db: Awaited<ReturnType<typeof useDb>>) {
  const marker = await queryDb(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key: USER_TABLE_MIGRATION_KEY },
    { label: 'user table migration marker check', timeoutMs: 5_000 }
  )

  if (firstRow(marker)) {
    return
  }

  const existingAdmin = await queryDb(
    db,
    'SELECT id FROM users WHERE username = $username LIMIT 1;',
    { username: 'admin' },
    { label: 'seed admin user check', timeoutMs: 5_000 }
  )
  let adminId = firstRow<{ id?: unknown }>(existingAdmin)?.id

  if (!adminId) {
    const legacyPassword = await queryDb(
      db,
      'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
      { key: 'admin_password_hash' },
      { label: 'legacy admin password lookup', timeoutMs: 5_000 }
    )
    const passwordHash = String(firstRow<{ value?: unknown }>(legacyPassword)?.value ?? '')

    if (passwordHash) {
      const created = await queryDb(
        db,
        `UPSERT type::record($table, $id) CONTENT {
          username: 'admin',
          password_hash: $passwordHash,
          role: 'superadmin',
          display_name: 'Administrator',
          email: NONE,
          active: true,
          last_login_at: NONE,
          created_at: time::now(),
          updated_at: time::now()
        };`,
        { table: 'users', id: 'admin', passwordHash },
        { label: 'seed admin user create', timeoutMs: 10_000 }
      )
      adminId = firstRow<{ id?: unknown }>(created)?.id
    }
  }

  if (adminId) {
    await queryDb(
      db,
      `UPDATE post SET author = $adminId WHERE author IS NONE;
       UPDATE tag SET created_by = $adminId WHERE created_by IS NONE;
       UPDATE category SET created_by = $adminId WHERE created_by IS NONE;
       UPDATE files SET created_by = $adminId WHERE created_by IS NONE;
       UPDATE files SET visibility = 'public' WHERE visibility IS NONE;`,
      { adminId },
      { label: 'ownership backfill to seed admin', timeoutMs: 30_000 }
    )
  }

  await setAppSetting(db, USER_TABLE_MIGRATION_KEY, new Date().toISOString(), 'user table migration marker')
}

async function ensureDefaultAdminColorMode(db: Awaited<ReturnType<typeof useDb>>) {
  const colorMode = await queryDb<[Array<{ value?: unknown }> ]>(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key: ADMIN_COLOR_MODE_KEY },
    { label: 'admin color mode lookup', timeoutMs: 5_000 }
  )

  if (firstRow(colorMode)) {
    return
  }

  await setAppSetting(db, ADMIN_COLOR_MODE_KEY, DEFAULT_ADMIN_COLOR_MODE, 'admin color mode init')
}

async function ensureDefaultAdminLocale(db: Awaited<ReturnType<typeof useDb>>) {
  const locale = await queryDb<[Array<{ value?: unknown }> ]>(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key: ADMIN_LOCALE_KEY },
    { label: 'admin locale lookup', timeoutMs: 5_000 }
  )

  if (firstRow(locale)) {
    return
  }

  await setAppSetting(db, ADMIN_LOCALE_KEY, DEFAULT_ADMIN_LOCALE, 'admin locale init')
}

async function ensureDefaultAdminRegionalSettings(db: Awaited<ReturnType<typeof useDb>>) {
  const defaults = [
    [ADMIN_DATE_FORMAT_KEY, DEFAULT_ADMIN_DATE_FORMAT, 'admin date format init'],
    [ADMIN_TIMEZONE_KEY, DEFAULT_ADMIN_TIMEZONE, 'admin timezone init'],
    [ADMIN_FORMAT_LOCALE_KEY, DEFAULT_ADMIN_FORMAT_LOCALE, 'admin format locale init']
  ] as const

  for (const [key, value, label] of defaults) {
    const existing = await queryDb<[Array<{ value?: unknown }> ]>(
      db,
      'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
      { key },
      { label: `${label} lookup`, timeoutMs: 5_000 }
    )

    if (!firstRow(existing)) {
      await setAppSetting(db, key, value, label)
    }
  }
}

async function ensureDefaultFolder(db: Awaited<ReturnType<typeof useDb>>) {
  const existing = await queryDb(
    db,
    'SELECT * FROM folder WHERE slug = $slug LIMIT 1;',
    { slug: 'default' },
    { label: 'default folder check', timeoutMs: 5_000 }
  )

  if (firstRow(existing)) {
    return
  }

  await queryDb(
    db,
    `CREATE folder CONTENT {
      name: 'Default',
      slug: 'default',
      parent: NONE,
      created_at: time::now(),
      updated_at: time::now()
    };`,
    undefined,
    { label: 'default folder init', timeoutMs: 10_000 }
  )
}

async function ensureMediaStorageVersion(db: Awaited<ReturnType<typeof useDb>>) {
  const response = await queryDb(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key: MEDIA_STORAGE_VERSION_KEY },
    { label: 'media storage version lookup', timeoutMs: 5_000 }
  )
  const current = firstRow<{ value?: string }>(response)?.value

  if (current === MEDIA_STORAGE_VERSION) {
    return
  }

  await queryDb(db, 'DELETE FROM files;', undefined, { label: 'media storage schema reset', timeoutMs: 30_000 })
  await queryDb(
    db,
    `UPDATE app_settings SET
      value = $value,
      updated_at = time::now()
    WHERE key = $key;`,
    {
      key: 'media',
      value: DEFAULT_MEDIA_SETTINGS
    },
    { label: 'media settings reset', timeoutMs: 10_000 }
  )
  const versionRow = await queryDb(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key: MEDIA_STORAGE_VERSION_KEY },
    { label: 'media storage version row check', timeoutMs: 5_000 }
  )
  const hasVersionRow = firstRow(versionRow)

  if (hasVersionRow) {
    await queryDb(
      db,
      `UPDATE app_settings SET
        value = $value,
        updated_at = time::now()
      WHERE key = $key;`,
      {
        key: MEDIA_STORAGE_VERSION_KEY,
        value: MEDIA_STORAGE_VERSION
      },
      { label: 'media storage version update', timeoutMs: 10_000 }
    )
    return
  }

  await queryDb(
    db,
    `CREATE app_settings CONTENT {
      key: $key,
      value: $value,
      updated_at: time::now()
    };`,
    {
      key: MEDIA_STORAGE_VERSION_KEY,
      value: MEDIA_STORAGE_VERSION
    },
    { label: 'media storage version create', timeoutMs: 10_000 }
  )
}

async function backfillPostStats(db: Awaited<ReturnType<typeof useDb>>) {
  const existing = await queryDb(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key: POST_STATS_BACKFILL_KEY },
    { label: 'post stats backfill marker check', timeoutMs: 5_000 }
  )

  if (firstRow(existing)) {
    return
  }

  try {
    const response = await queryDb(
      db,
      `SELECT in AS post_id, out.text AS text FROM has_blocks FETCH out;`,
      undefined,
      { label: 'post stats backfill load blocks', timeoutMs: 30_000 }
    )
    const rows = queryRows<{ post_id?: unknown, text?: unknown }>(response, 0)
    const textsByPost = new Map<string, string[]>()
    for (const row of rows) {
      const postId = stringifyRecordId(row.post_id)
      if (!postId) continue
      const list = textsByPost.get(postId) ?? []
      list.push(typeof row.text === 'string' ? row.text : '')
      textsByPost.set(postId, list)
    }

    for (const [postId, texts] of textsByPost) {
      const stats = computeContentStats(texts.join('\n'))
      const id = postId.startsWith('post:') ? postId.slice(5) : postId
      await queryDb(
        db,
        'UPDATE type::record($table, $id) MERGE { word_count: $word_count, cjk_char_count: $cjk_char_count };',
        { table: 'post', id, ...stats },
        { label: 'post stats backfill update', timeoutMs: 10_000 }
      )
    }
  } catch (error) {
    console.warn('[db-init] post stats backfill failed', error)
    return
  }

  await setAppSetting(db, POST_STATS_BACKFILL_KEY, new Date().toISOString(), 'post stats backfill marker')
}

async function resetPostStatsFieldDefinitionsBeforeSchema(db: Awaited<ReturnType<typeof useDb>>) {
  try {
    await queryDb(
      db,
      `REMOVE FIELD IF EXISTS word_count ON post;
       REMOVE FIELD IF EXISTS cjk_char_count ON post;`,
      undefined,
      { label: 'post stats field reset', timeoutMs: 10_000 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('does not exist')) {
      console.warn('[db-init] post stats field reset skipped', error)
    }
  }
}

async function setAppSetting(
  db: Awaited<ReturnType<typeof useDb>>,
  key: string,
  value: unknown,
  label: string
) {
  const existing = await queryDb(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key },
    { label: `${label} lookup`, timeoutMs: 5_000 }
  )

  if (firstRow(existing)) {
    await queryDb(
      db,
      `UPDATE app_settings SET
        value = $value,
        updated_at = time::now()
      WHERE key = $key;`,
      { key, value },
      { label: `${label} update`, timeoutMs: 10_000 }
    )
    return
  }

  await queryDb(
    db,
    `CREATE app_settings CONTENT {
      key: $key,
      value: $value,
      updated_at: time::now()
    };`,
    { key, value },
    { label: `${label} create`, timeoutMs: 10_000 }
  )
}

async function migrateLegacyAppSettingsTable(db: Awaited<ReturnType<typeof useDb>>) {
  try {
    const response = await queryDb(
      db,
      `SELECT * FROM ${LEGACY_APP_SETTINGS_TABLE};`,
      undefined,
      { label: 'legacy app settings lookup', timeoutMs: 10_000 }
    )
    const rows = queryRows<Record<string, unknown>>(response)

    if (!rows.length) {
      return
    }

    for (const row of rows) {
      const key = typeof row.key === 'string' ? row.key : ''
      if (!key) {
        continue
      }

      await queryDb(
        db,
        `UPSERT type::record($table, $id) CONTENT {
          key: $key,
          value: $value,
          updated_at: time::now()
        };`,
        {
          table: APP_SETTINGS_TABLE,
          id: key,
          key,
          value: row.value
        },
        { label: 'legacy app settings copy', timeoutMs: 10_000 }
      )
    }

    await queryDb(
      db,
      `REMOVE TABLE ${LEGACY_APP_SETTINGS_TABLE};`,
      undefined,
      { label: 'legacy app settings remove', timeoutMs: 10_000 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('does not exist')) {
      return
    }
    console.warn('[db-init] legacy app settings migration skipped', error)
  }
}