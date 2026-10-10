import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { queryDb, type useDb } from './db'

export const SCHEMA_HASH_KEY = '__schema_hash'

export async function loadSchema(): Promise<{ schema: string, hash: string }> {
  const schema = await readFile(resolve(process.cwd(), 'server/utils/schema.surql'), 'utf8')
  return { schema, hash: createHash('sha256').update(schema).digest('hex') }
}

/** Apply the current schema using a privileged connection. */
export async function applySchema(db: Awaited<ReturnType<typeof useDb>>, schema?: string, options: {preserveData?: boolean} = {}): Promise<void> {
  let sql = schema ?? (await loadSchema()).schema
  // Restore synchronizes our reviewed static definitions without running
  // unrelated one-time removals/index rebuilds or resetting content statistics.
  if (options.preserveData) sql = sql
    .replace(/^(?:REMOVE|UPDATE) [^\r\n]*;\r?$/gm, '')
    .replace(/^(DEFINE (?:TABLE|FIELD|ANALYZER)) OVERWRITE /gm, '$1 IF NOT EXISTS ')
  // Retain the boot initializer's compatibility reset for old post stats fields.
  if (!options.preserveData) try {
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
