import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { exportSurrealDbToBuffer, importSurrealDb, runSqlHttp } from './surrealHttp'

/**
 * Minimum structural requirements for a SurrealDB export dump. The official
 * export always begins with an `OPTION IMPORT` directive and contains at least
 * one DEFINE / INSERT / CREATE / UPDATE statement.
 */
export function validateDumpStructure(surql: string): void {
  const text = surql.trim()
  if (!text) {
    throw createError({ statusCode: 400, message: 'Backup database dump is empty.' })
  }
  if (!/OPTION\s+IMPORT/i.test(text)) {
    throw createError({
      statusCode: 400,
      message: 'Backup dump is missing the required `OPTION IMPORT` directive — it does not look like a SurrealDB export.',
    })
  }
  if (!/(DEFINE|INSERT|CREATE|UPDATE|RELATE)\s/i.test(text)) {
    throw createError({
      statusCode: 400,
      message: 'Backup dump contains no DEFINE/INSERT/CREATE statements.',
    })
  }
}

function tempDbName(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`
}

/** Quotes a database identifier for use in SurrealQL. */
function quoteDb(name: string): string {
  return '`' + name.replace(/[`\\]/g, '') + '`'
}

async function dropDatabase(name: string): Promise<void> {
  // REMOVE DATABASE is namespace-scoped; run it against the primary DB context.
  await runSqlHttp(`REMOVE DATABASE IF EXISTS ${quoteDb(name)};`).catch(() => {})
}

/**
 * Validates a SurrealQL dump by importing it into a throwaway database in the
 * same namespace and inspecting every statement result. The staging database is
 * always removed afterwards. Throws if any statement fails so a corrupt or
 * partial dump can never be applied to the live database.
 */
export async function validateDumpByStaging(surql: Buffer | string): Promise<void> {
  const text = typeof surql === 'string' ? surql : surql.toString('utf8')
  validateDumpStructure(text)

  const stage = tempDbName('__pb_validate')
  try {
    // Selecting the staging DB via header auto-creates it on first write, but be
    // explicit so an empty dump still has a database to target.
    await runSqlHttp(`DEFINE DATABASE IF NOT EXISTS ${quoteDb(stage)};`)
    await importSurrealDb(Readable.from(Buffer.from(text, 'utf8')), stage)
  } finally {
    await dropDatabase(stage)
  }
}

/**
 * Builds a single complete dump from a base full dump plus a partial (table
 * subset) dump layered on top. Used both when restoring a partial backup and
 * when downloading a consolidated DB for one.
 *
 * Imports the base into a staging database, applies the partial on top (its
 * records overwrite the base), exports the merged result, then drops the stage.
 */
export async function consolidateDumps(baseFull: Buffer, partial: Buffer): Promise<Buffer> {
  validateDumpStructure(baseFull.toString('utf8'))
  validateDumpStructure(partial.toString('utf8'))

  const stage = tempDbName('__pb_consolidate')
  try {
    await runSqlHttp(`DEFINE DATABASE IF NOT EXISTS ${quoteDb(stage)};`)
    await importSurrealDb(Readable.from(baseFull), stage)
    await importSurrealDb(Readable.from(partial), stage)
    return await exportSurrealDbToBuffer(undefined, stage)
  } finally {
    await dropDatabase(stage)
  }
}
