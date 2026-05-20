import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { queryDb, useDb } from '../utils/db'
import { initializeLoggingSettings } from '../utils/logging'
import { firstRow } from '../utils/surrealResult'

const SCHEMA_HASH_KEY = '__schema_hash'
const DEFAULT_MEDIA_SETTINGS = {
  allowed_extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'mp4', 'webm', 'mov', 'zip', 'rar', '7z'],
  max_file_size_mb: 10,
  max_files_per_upload: 5,
  enable_perceptual_dedup: true,
  perceptual_dedup_threshold: 5
}

export default defineNitroPlugin(async () => {
  const db = await useDb()
  const schema = await readFile(resolve(process.cwd(), 'server/utils/schema.surql'), 'utf8')
  const schemaHash = createHash('sha256').update(schema).digest('hex')

  if (!await hasCurrentSchemaHash(db, schemaHash)) {
    await queryDb(db, schema, undefined, { label: 'schema initialization', timeoutMs: 30_000 })
    await queryDb(
      db,
      `UPSERT type::record($table, $id) CONTENT {
        key: $key,
        value: $value,
        updated_at: time::now()
      };`,
      {
        table: 'app_setting',
        id: SCHEMA_HASH_KEY,
        key: SCHEMA_HASH_KEY,
        value: schemaHash
      },
      { label: 'schema hash update', timeoutMs: 10_000 }
    )
  }

  await ensureDefaultMediaSettings(db)
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

  await queryDb(
    db,
    `UPSERT type::record($table, $id) CONTENT {
      key: $key,
      value: $value,
      updated_at: time::now()
    };`,
    {
      table: 'app_setting',
      id: 'media',
      key: 'media',
      value: DEFAULT_MEDIA_SETTINGS
    },
    { label: 'media settings init', timeoutMs: 10_000 }
  )
}