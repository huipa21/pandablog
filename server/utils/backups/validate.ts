import { randomBytes } from 'node:crypto'
import { open } from 'node:fs/promises'
import { importSurrealDb, runSqlHttp } from './surrealHttp'
import { BACKUP_LIMITS, regularFile } from './streams'

/** Compatibility preflight, NOT a sandbox for administrator-controlled SQL. */
export function validateDumpStructure(text: string): void {
  if (!text.trim()) throw new Error('Backup dump is empty')
  if (!/OPTION\s+IMPORT/i.test(text)) throw new Error('Backup dump is missing OPTION IMPORT')
  if (!/(DEFINE|INSERT|CREATE|UPDATE|RELATE)\s/i.test(text)) throw new Error('Backup dump has no DEFINE/INSERT/CREATE statements')
}
async function preflight(source: string) {
  await regularFile(source, BACKUP_LIMITS.sqlBytes)
  const file = await open(source, 'r')
  try { const prefix = Buffer.alloc(64 * 1024); const {bytesRead} = await file.read(prefix, 0, prefix.length, 0); validateDumpStructure(prefix.subarray(0, bytesRead).toString('utf8')) } finally {await file.close()}
}
const quote = (name: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Unsupported snapshot table identifier')
  return '`' + name + '`'
}
export interface SnapshotProfile { [table: string]: { count: number, sample: string } }
function result(body: unknown): unknown { return (body as {result: unknown}[])[0]?.result }
export async function snapshotProfile(database?: string): Promise<SnapshotProfile> {
  const info = result(await runSqlHttp('INFO FOR DB;', database)) as { tables?: Record<string, unknown> }
  if (!info?.tables || typeof info.tables !== 'object') throw new Error('Invalid snapshot schema response')
  const tables = Object.keys(info.tables).sort()
  if (!tables.length || tables.length > 200) throw new Error('Unsupported snapshot table count')
  const profile: SnapshotProfile = {}
  for (const table of tables) {
    const counts = result(await runSqlHttp(`SELECT count() AS total FROM ${quote(table)} GROUP ALL;`, database)) as {total: number}[]
    const count = counts?.[0]?.total ?? 0
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid snapshot row count')
    const sample = result(await runSqlHttp(`SELECT * FROM ${quote(table)} WITH NOINDEX ORDER BY id LIMIT 3;`, database))
    if (/TYPE RELATION/i.test(String(info.tables[table]))) {
      const dangling = result(await runSqlHttp(`SELECT id FROM ${quote(table)} WHERE !record::exists(in) OR !record::exists(out) LIMIT 1;`, database)) as unknown[]
      if (dangling.length) throw new Error('Snapshot has dangling graph references; include all related tables')
    }
    profile[table] = {count, sample: JSON.stringify(sample)}
  }
  return profile
}
export async function verifySnapshot(expected: SnapshotProfile, database?: string) {
  if (JSON.stringify(await snapshotProfile(database)) !== JSON.stringify(expected)) throw new Error('Snapshot record/schema verification failed')
}
export async function validateDumpByStaging(source: string, inspect?: (database: string) => Promise<void>): Promise<SnapshotProfile> {
  await preflight(source)
  const stage = `__pb_validate_${randomBytes(12).toString('hex')}`
  try {
    await runSqlHttp(`DEFINE DATABASE ${quote(stage)};`)
    await importSurrealDb(source, stage)
    const profile = await snapshotProfile(stage)
    await inspect?.(stage)
    return profile
  } finally {await runSqlHttp(`REMOVE DATABASE IF EXISTS ${quote(stage)};`)}
}
