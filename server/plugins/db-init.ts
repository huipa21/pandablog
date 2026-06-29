import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { flattenBlockSearchText, flattenNodeText } from '../utils/blocks'
import { closeRootClient, connectRootClient, provisionAppDatabaseUser, queryDb, useDb } from '../utils/db'
import { initializeLoggingSettings } from '../utils/logging'
import { initializeAnalyticsSettings, initializeRuntimeSettings, initializeSecuritySettings } from '../utils/settings'
import { firstRow, queryRows, stringifyRecordId } from '../utils/surrealResult'
import { ADMIN_LOCALE_KEY, DEFAULT_ADMIN_LOCALE } from '~/utils/adminLocale'
import { computeContentStats } from '~/utils/contentStats'
import type { JsonContent } from '~/types/content'
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
const POST_VERSION_GRAPH_MIGRATION_KEY = '__post_version_graph_migration_v1'
const POST_VERSION_DEDUP_MIGRATION_KEY = '__post_version_dedup_migration_v1'
const POST_STATS_BACKFILL_KEY = '__post_stats_backfill_v2'
const BLOCK_TEXT_REINDEX_KEY = '__block_text_reindex_v3'
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
  prevent_hotlinking: false,
  orphan_cleanup_enabled: false,
  orphan_cleanup_days: 30,
  orphan_cleanup_cron: '0 4 * * *'
}

export default defineNitroPlugin(async () => {
  let rootDb: Awaited<ReturnType<typeof connectRootClient>> | null = null
  try {
    // Boot-time privileged work (provisioning the scoped runtime user, schema
    // and migrations) runs on a dedicated short-lived ROOT client so the shared
    // runtime pool can authenticate as the least-privilege EDITOR user. Provision
    // the runtime user FIRST so the pool's first scoped sign-in (deferred
    // backfills and real requests) succeeds on a fresh install.
    rootDb = await connectRootClient()
    await provisionAppDatabaseUser(rootDb)
    const db = rootDb

    await migrateLegacyAppSettingsTable(db)
    const rawSchema = await readFile(resolve(process.cwd(), 'server/utils/schema.surql'), 'utf8')
    const schema = stripModuleSchemaSections(rawSchema, {
      logs: __PB_MODULE_LOGS__,
      analytics: __PB_MODULE_ANALYTICS__,
      backups: __PB_MODULE_BACKUPS__
    })
    const schemaHash = createHash('sha256').update(schema).digest('hex')

    if (!await hasCurrentSchemaHash(db, schemaHash)) {
      await resetPostStatsFieldDefinitionsBeforeSchema(db)
      await queryDb(db, schema, undefined, { label: 'schema initialization', timeoutMs: 30_000 })
      await setAppSetting(db, SCHEMA_HASH_KEY, schemaHash, 'schema hash update')
    }

    await ensureUserTableMigration(db)
  await ensurePostVersionGraphMigration(db)
    await ensureVersionEdgeDedupMigration(db)
    await ensureMediaStorageVersion(db)
    await ensureDefaultMediaSettings(db)
    await ensureDefaultAdminColorMode(db)
    await ensureDefaultAdminLocale(db)
    await ensureDefaultAdminRegionalSettings(db)
    await initializeRuntimeSettings(true)
    if (__PB_MODULE_ANALYTICS__) {
      await initializeAnalyticsSettings(true)
    }
    await initializeSecuritySettings(true)
    await ensureDefaultFolder(db)
    if (__PB_MODULE_LOGS__) {
      await initializeLoggingSettings()
    }

    // One-time, marker-guarded backfills do a full-table scan + FTS reindex.
    // Run them in the background via the runtime pool (scoped user) so a fresh
    // deploy starts serving requests immediately instead of blocking boot (and
    // the first request) on them.
    void runDeferredBackfillsViaPool()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[db-init] FATAL: database initialization failed:', message)
    if (error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    throw error
  } finally {
    // Release the privileged boot connection; all subsequent traffic uses the
    // least-privilege runtime pool.
    await closeRootClient(rootDb)
  }
})

function stripModuleSchemaSections(schema: string, enabledModules: Record<string, boolean>) {
  let result = schema
  for (const [moduleName, enabled] of Object.entries(enabledModules)) {
    if (enabled) {
      continue
    }

    result = result.replace(new RegExp(`-- #module ${moduleName} start\\r?\\n[\\s\\S]*?-- #module ${moduleName} end\\r?\\n?`, 'g'), '')
  }

  return result
}

async function runDeferredBackfillsViaPool() {
  try {
    const db = await useDb()
    await runDeferredBackfills(db)
  } catch (error) {
    console.warn('[db-init] deferred backfills could not start', error)
  }
}

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

async function ensurePostVersionGraphMigration(db: Awaited<ReturnType<typeof useDb>>) {
  const marker = await queryDb(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key: POST_VERSION_GRAPH_MIGRATION_KEY },
    { label: 'post version graph migration marker check', timeoutMs: 5_000 }
  )

  if (firstRow(marker)) {
    return
  }

  const postsResponse = await queryDb(
    db,
    'SELECT id, status FROM post;',
    undefined,
    { label: 'post version graph migration load posts', timeoutMs: 30_000 }
  )
  const posts = queryRows<{ id?: unknown, status?: unknown }>(postsResponse, 0)

  for (const post of posts) {
    const postRecordId = stringifyRecordId(post.id)
    const postId = postRecordId.startsWith('post:') ? postRecordId.slice(5) : postRecordId
    if (!postId) continue

    const versionId = `${postId}__current`
    await queryDb(
      db,
      `UPSERT type::record('versions', $versionId) CONTENT { version: 'current', datetime: time::now(), diff: [], created_at: time::now() };
       RELATE (type::record('post', $postId)) -> has_version -> (type::record('versions', $versionId));
       UPDATE post SET has_versioning = true WHERE id = type::record('post', $postId) AND status = 'published';`,
      { postId, versionId },
      { label: 'post current version migration create', timeoutMs: 10_000 }
    )

    const legacyEdges = await queryDb(
      db,
      `SELECT out AS block_id, seq FROM has_blocks WHERE in = type::record('post', $postId);`,
      { postId },
      { label: 'post current version migration legacy edges', timeoutMs: 10_000 }
    )
    const rows = queryRows<{ block_id?: unknown, seq?: unknown }>(legacyEdges, 0)
    if (!rows.length) continue

    const stmts: string[] = []
    const params: Record<string, unknown> = { postId, versionId }
    rows.forEach((row, index) => {
      const blockRecordId = stringifyRecordId(row.block_id)
      const blockId = blockRecordId.startsWith('block:') ? blockRecordId.slice(6) : blockRecordId
      if (!blockId) return
      params[`bid_${index}`] = blockId
      params[`seq_${index}`] = Number(row.seq ?? (index + 1) * 10)
      stmts.push(`RELATE (type::record('versions', $versionId)) -> has_blocks -> (type::record('block', $bid_${index})) CONTENT { seq: $seq_${index} };`)
    })
    stmts.push(`DELETE has_blocks WHERE in = type::record('post', $postId);`)
    if (stmts.length) {
      await queryDb(db, stmts.join('\n'), params, { label: 'post current version migration move edges', timeoutMs: 30_000 })
    }
  }

  await setAppSetting(db, POST_VERSION_GRAPH_MIGRATION_KEY, new Date().toISOString(), 'post version graph migration marker')
}

/**
 * Collapse duplicate `has_version` edges (a post pointing at the same version
 * record more than once produced duplicate "versions" in the editor UI), drop
 * orphaned version/block records, then enforce a UNIQUE (in, out) index so the
 * duplication can never recur. Marker-guarded; runs once per database.
 */
async function ensureVersionEdgeDedupMigration(db: Awaited<ReturnType<typeof useDb>>) {
  const marker = await queryDb(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key: POST_VERSION_DEDUP_MIGRATION_KEY },
    { label: 'version edge dedup migration marker check', timeoutMs: 5_000 }
  )

  if (firstRow(marker)) {
    return
  }

  // 1. Keep a single has_version edge per (in, out); delete the rest.
  const edgesResponse = await queryDb(
    db,
    'SELECT id, in, out FROM has_version;',
    undefined,
    { label: 'version edge dedup load edges', timeoutMs: 30_000 }
  )
  const edges = queryRows<{ id?: unknown, in?: unknown, out?: unknown }>(edgesResponse, 0)
  const seenPairs = new Set<string>()
  const duplicateEdgeIds: string[] = []
  for (const edge of edges) {
    const inId = stringifyRecordId(edge.in)
    const outId = stringifyRecordId(edge.out)
    if (!inId || !outId) continue
    const pairKey = `${inId}__${outId}`
    if (seenPairs.has(pairKey)) {
      const edgeId = stringifyRecordId(edge.id)
      const edgeIdPart = edgeId.startsWith('has_version:') ? edgeId.slice('has_version:'.length) : edgeId
      if (edgeIdPart) duplicateEdgeIds.push(edgeIdPart)
    } else {
      seenPairs.add(pairKey)
    }
  }
  if (duplicateEdgeIds.length) {
    const stmts: string[] = []
    const params: Record<string, unknown> = {}
    duplicateEdgeIds.forEach((edgeIdPart, index) => {
      params[`eid_${index}`] = edgeIdPart
      stmts.push(`DELETE type::record('has_version', $eid_${index});`)
    })
    await queryDb(db, stmts.join('\n'), params, { label: `version edge dedup delete ${duplicateEdgeIds.length} duplicate edges`, timeoutMs: 30_000 })
  }

  // 2. Drop orphaned version records (no remaining has_version edge), their
  //    has_blocks edges, and any block left with no owning version.
  const orphansResponse = await queryDb(
    db,
    'SELECT id FROM versions WHERE count(<-has_version) = 0;',
    undefined,
    { label: 'version edge dedup load orphans', timeoutMs: 30_000 }
  )
  const orphanIds = queryRows<{ id?: unknown }>(orphansResponse, 0)
    .map((row) => stringifyRecordId(row.id))
    .filter(Boolean)
  for (const orphan of orphanIds) {
    const versionId = orphan.startsWith('versions:') ? orphan.slice('versions:'.length) : orphan
    if (!versionId) continue
    const blockResponse = await queryDb(
      db,
      `SELECT out AS id FROM has_blocks WHERE in = type::record('versions', $versionId);`,
      { versionId },
      { label: 'version edge dedup orphan blocks', timeoutMs: 10_000 }
    )
    const blockIds = queryRows<{ id: unknown }>(blockResponse, 0)
      .map((row) => {
        const blockRecordId = stringifyRecordId(row.id)
        return blockRecordId.startsWith('block:') ? blockRecordId.slice('block:'.length) : blockRecordId
      })
      .filter(Boolean)
    const stmts = [
      `DELETE has_blocks WHERE in = type::record('versions', $versionId);`,
      `DELETE type::record('versions', $versionId);`
    ]
    const params: Record<string, unknown> = { versionId }
    blockIds.forEach((blockId, index) => {
      params[`bid_${index}`] = blockId
      stmts.push(`DELETE type::record('block', $bid_${index}) WHERE count(<-has_blocks) = 0;`)
    })
    await queryDb(db, stmts.join('\n'), params, { label: 'version edge dedup delete orphan version', timeoutMs: 30_000 })
  }

  // 3. Duplicates are gone; enforce uniqueness so the bug cannot recur.
  await queryDb(
    db,
    'DEFINE INDEX IF NOT EXISTS has_version_unique ON TABLE has_version FIELDS in, out UNIQUE;',
    undefined,
    { label: 'version edge unique index', timeoutMs: 30_000 }
  )

  await setAppSetting(db, POST_VERSION_DEDUP_MIGRATION_KEY, new Date().toISOString(), 'version edge dedup migration marker')
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

async function runDeferredBackfills(db: Awaited<ReturnType<typeof useDb>>) {
  try {
    await backfillPostStats(db)
    await backfillBlockText(db)
  } catch (error) {
    console.warn('[db-init] deferred backfills failed', error)
  }
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
      `SELECT <-has_version<-post[0].id AS post_id, out.node AS node
       FROM has_blocks
       WHERE in.version = 'current'
       FETCH out;`,
      undefined,
      { label: 'post stats backfill load blocks', timeoutMs: 30_000 }
    )
    const rows = queryRows<{ post_id?: unknown, node?: unknown }>(response, 0)
    const textsByPost = new Map<string, string[]>()
    for (const row of rows) {
      const postId = stringifyRecordId(row.post_id)
      if (!postId) continue
      const list = textsByPost.get(postId) ?? []
      list.push(flattenNodeText(row.node as JsonContent | null | undefined))
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

/**
 * Recompute `block.text` from the stored `block.node` for every block.
 * Necessary because the FTS source text is computed at save time, so existing
 * rows keep stale text after the text-extraction logic changes (e.g. adding
 * `rubyUnit` base extraction so annotated characters become searchable).
 * Writing the new text also reindexes the row under the current analyzer.
 */
async function backfillBlockText(db: Awaited<ReturnType<typeof useDb>>) {
  const existing = await queryDb(
    db,
    'SELECT * FROM app_settings WHERE key = $key LIMIT 1;',
    { key: BLOCK_TEXT_REINDEX_KEY },
    { label: 'block text reindex marker check', timeoutMs: 5_000 }
  )

  if (firstRow(existing)) {
    return
  }

  try {
    const response = await queryDb(
      db,
      'SELECT id, node, text FROM block;',
      undefined,
      { label: 'block text reindex load', timeoutMs: 30_000 }
    )
    const rows = queryRows<{ id?: unknown, node?: unknown, text?: unknown }>(response, 0)

    for (const row of rows) {
      const blockId = stringifyRecordId(row.id)
      if (!blockId) continue
      const recomputed = flattenBlockSearchText(row.node as never)
      const current = typeof row.text === 'string' ? row.text : ''
      if (recomputed === current) continue
      const id = blockId.startsWith('block:') ? blockId.slice(6) : blockId
      await queryDb(
        db,
        'UPDATE type::record($table, $id) MERGE { text: $text, updated_at: time::now() };',
        { table: 'block', id, text: recomputed },
        { label: 'block text reindex update', timeoutMs: 10_000 }
      )
    }
  } catch (error) {
    console.warn('[db-init] block text reindex failed', error)
    return
  }

  await setAppSetting(db, BLOCK_TEXT_REINDEX_KEY, new Date().toISOString(), 'block text reindex marker')
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