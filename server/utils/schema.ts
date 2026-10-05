import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { queryDb, type useDb } from './db'

export const SCHEMA_HASH_KEY = '__schema_hash'

export function stripModuleSchemaSections(schema: string, enabledModules: Record<string, boolean>): string {
  let result = schema
  for (const [moduleName, enabled] of Object.entries(enabledModules)) {
    if (!enabled) {
      result = result.replace(new RegExp(`-- #module ${moduleName} start\\r?\\n[\\s\\S]*?-- #module ${moduleName} end\\r?\\n?`, 'g'), '')
    }
  }
  return result
}

export async function loadSchema(): Promise<{ schema: string, hash: string }> {
  const raw = await readFile(resolve(process.cwd(), 'server/utils/schema.surql'), 'utf8')
  const schema = stripModuleSchemaSections(raw, {
    logs: __PB_MODULE_LOGS__,
    analytics: __PB_MODULE_ANALYTICS__,
    backups: __PB_MODULE_BACKUPS__
  })
  return { schema, hash: createHash('sha256').update(schema).digest('hex') }
}

/** Apply the current, module-filtered schema using a privileged connection. */
export async function applySchema(db: Awaited<ReturnType<typeof useDb>>, schema?: string): Promise<void> {
  const sql = schema ?? (await loadSchema()).schema
  // Retain the boot initializer's compatibility reset for old post stats fields.
  try {
    await queryDb(
      db,
      `REMOVE FIELD IF EXISTS word_count ON post;
       REMOVE FIELD IF EXISTS cjk_char_count ON post;`,
      undefined,
      { label: 'post stats field reset', timeoutMs: 10_000, retryOnReconnect: false }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('does not exist')) {
      console.warn('[db-init] post stats field reset skipped', error)
    }
  }
  await queryDb(db, sql, undefined, {
    label: 'schema initialization', timeoutMs: 30_000, retryOnReconnect: false
  })
}
