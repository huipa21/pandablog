import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { surrealHttpBase } from './config'

function buildAuthHeader(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
}

export interface ExportTableSelection {
  /** When provided, only these tables are exported. Omit/undefined = all tables. */
  tables?: string[]
}

export interface ImportStatementSummary {
  total: number
  ok: number
  errors: string[]
}

/**
 * Inspects the JSON body returned by the SurrealDB /import (and /sql) endpoints.
 *
 * SurrealDB returns HTTP 200 even when individual statements fail — the body is
 * an array of `{ status: 'OK' | 'ERR', result, time }`. A naive `response.ok`
 * check therefore silently swallows import failures (this caused restores to do
 * nothing while reporting success). We parse the body and surface every ERR.
 */
export function summarizeStatementResults(body: unknown): ImportStatementSummary {
  const rows = Array.isArray(body) ? body : body == null ? [] : [body]
  const errors: string[] = []
  let ok = 0

  for (const row of rows) {
    if (row && typeof row === 'object') {
      const status = (row as { status?: unknown }).status
      if (status === 'ERR') {
        const detail = (row as { result?: unknown }).result
        errors.push(typeof detail === 'string' ? detail : JSON.stringify(detail))
        continue
      }
    }
    ok++
  }

  return { total: rows.length, ok, errors }
}

/**
 * Streams a SurrealDB export from the HTTP /export endpoint.
 * Returns a raw Node.js Readable of the SurQL text.
 *
 * @param selection  optional table subset for partial backups (default: all)
 * @param database   optional database name override (default: configured DB)
 */
export async function exportSurrealDb(
  selection?: ExportTableSelection,
  database?: string
): Promise<Readable> {
  const config = useRuntimeConfig()
  const base = surrealHttpBase(config.surrealUrl)
  const url = `${base}/export`

  // SurrealDB v2+/v3 require a Content-Type header and a JSON export-config body
  // on POST /export. Omitting them yields: HTTP 400 "Header of type `content-type` was missing".
  // For partial backups we pass an explicit list of tables; otherwise true = all.
  const tablesValue = selection?.tables && selection.tables.length > 0
    ? selection.tables
    : true

  const exportConfig = {
    users: true,
    accesses: true,
    params: true,
    functions: true,
    analyzers: true,
    versions: false,
    tables: tablesValue,
    records: true,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': buildAuthHeader(config.surrealRoot, config.surrealRootPassword),
      'Surreal-NS': config.surrealNamespace,
      'Surreal-DB': database ?? config.surrealDatabase,
      'Content-Type': 'application/json',
      'Accept': 'application/octet-stream',
    },
    body: JSON.stringify(exportConfig),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`SurrealDB export failed (HTTP ${response.status}): ${text.slice(0, 200)}`)
  }

  if (!response.body) {
    throw new Error('SurrealDB export returned no body')
  }

  return Readable.fromWeb(response.body as import('stream/web').ReadableStream<Uint8Array>)
}

/** Convenience wrapper that buffers an export stream into a single Buffer. */
export async function exportSurrealDbToBuffer(
  selection?: ExportTableSelection,
  database?: string
): Promise<Buffer> {
  const stream = await exportSurrealDb(selection, database)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Imports a SurQL stream into SurrealDB via the HTTP /import endpoint.
 *
 * Throws if the request is rejected OR if any individual statement returns an
 * ERR status, so callers never mistake a partial/failed import for success.
 *
 * @param database  optional target database override (used for staging DBs)
 */
export async function importSurrealDb(stream: Readable, database?: string): Promise<ImportStatementSummary> {
  const config = useRuntimeConfig()
  const base = surrealHttpBase(config.surrealUrl)
  const url = `${base}/import`

  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const body = Buffer.concat(chunks)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': buildAuthHeader(config.surrealRoot, config.surrealRootPassword),
      'Surreal-NS': config.surrealNamespace,
      'Surreal-DB': database ?? config.surrealDatabase,
      'Content-Type': 'text/plain',
      'Accept': 'application/json',
    },
    body,
  })

  const text = await response.text().catch(() => '')

  if (!response.ok) {
    throw new Error(`SurrealDB import failed (HTTP ${response.status}): ${text.slice(0, 400)}`)
  }

  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    // Body was not JSON; treat as opaque success only when the status was ok.
    return { total: 0, ok: 0, errors: [] }
  }

  const summary = summarizeStatementResults(parsed)
  if (summary.errors.length > 0) {
    throw new Error(
      `SurrealDB import completed with ${summary.errors.length} failed statement(s): ${summary.errors[0]?.slice(0, 300)}`
    )
  }

  return summary
}

/**
 * Runs raw SurrealQL over the HTTP /sql endpoint against an arbitrary database
 * (used for staging databases that are not the app's primary connection).
 * Throws on any ERR statement.
 */
export async function runSqlHttp(sql: string, database?: string): Promise<unknown> {
  const config = useRuntimeConfig()
  const base = surrealHttpBase(config.surrealUrl)
  const url = `${base}/sql`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': buildAuthHeader(config.surrealRoot, config.surrealRootPassword),
      'Surreal-NS': config.surrealNamespace,
      'Surreal-DB': database ?? config.surrealDatabase,
      'Content-Type': 'text/plain',
      'Accept': 'application/json',
    },
    body: sql,
  })

  const text = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(`SurrealDB SQL failed (HTTP ${response.status}): ${text.slice(0, 400)}`)
  }

  const parsed = text ? JSON.parse(text) : null
  const summary = summarizeStatementResults(parsed)
  if (summary.errors.length > 0) {
    throw new Error(`SurrealDB SQL error: ${summary.errors[0]?.slice(0, 300)}`)
  }
  return parsed
}

/**
 * Computes the SHA-256 hex digest of a file on disk.
 */
export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}
