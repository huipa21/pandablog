import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { queryDb, useDb } from '../utils/db'
import { initializeLoggingSettings } from '../utils/logging'
import { firstRow } from '../utils/surrealResult'

const SCHEMA_HASH_KEY = '__schema_hash'
const MEDIA_STORAGE_VERSION_KEY = '__media_storage_version'
const MEDIA_STORAGE_VERSION = '2026-05-image-variants-v2'
const DEFAULT_MEDIA_SETTINGS = {
  allowed_extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'mp4', 'webm', 'mov', 'zip', 'rar', '7z'],
  max_file_size_mb: 10,
  max_files_per_upload: 5,
  enable_perceptual_dedup: false,
  perceptual_dedup_threshold: 5
}

export default defineNitroPlugin(async () => {
  const db = await useDb()
  const schema = await readFile(resolve(process.cwd(), 'server/utils/schema.surql'), 'utf8')
  const schemaHash = createHash('sha256').update(schema).digest('hex')

  if (!await hasCurrentSchemaHash(db, schemaHash)) {
    await queryDb(db, schema, undefined, { label: 'schema initialization', timeoutMs: 30_000 })
    await setAppSetting(db, SCHEMA_HASH_KEY, schemaHash, 'schema hash update')
  }

  await ensureMediaStorageVersion(db)
  await ensureDefaultMediaSettings(db)
  await ensureDefaultFolder(db)
  await initializeLoggingSettings()
})

async function hasCurrentSchemaHash(db: Awaited<ReturnType<typeof useDb>>, schemaHash: string) {
  try {
    const response = await queryDb<[Array<{ value?: string }> ]>(
      db,
      'SELECT * FROM app_setting WHERE key = $key LIMIT 1;',
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
    'SELECT * FROM app_setting WHERE key = $key LIMIT 1;',
    { key: 'media' },
    { label: 'media settings lookup', timeoutMs: 10_000 }
  )

  if (firstRow(mediaSettings)) {
    return
  }

  await setAppSetting(db, 'media', DEFAULT_MEDIA_SETTINGS, 'media settings init')
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
    'SELECT * FROM app_setting WHERE key = $key LIMIT 1;',
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
    `UPDATE app_setting SET
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
    'SELECT * FROM app_setting WHERE key = $key LIMIT 1;',
    { key: MEDIA_STORAGE_VERSION_KEY },
    { label: 'media storage version row check', timeoutMs: 5_000 }
  )
  const hasVersionRow = firstRow(versionRow)

  if (hasVersionRow) {
    await queryDb(
      db,
      `UPDATE app_setting SET
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
    `CREATE app_setting CONTENT {
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

async function setAppSetting(
  db: Awaited<ReturnType<typeof useDb>>,
  key: string,
  value: unknown,
  label: string
) {
  const existing = await queryDb(
    db,
    'SELECT * FROM app_setting WHERE key = $key LIMIT 1;',
    { key },
    { label: `${label} lookup`, timeoutMs: 5_000 }
  )

  if (firstRow(existing)) {
    await queryDb(
      db,
      `UPDATE app_setting SET
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
    `CREATE app_setting CONTENT {
      key: $key,
      value: $value,
      updated_at: time::now()
    };`,
    { key, value },
    { label: `${label} create`, timeoutMs: 10_000 }
  )
}