import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { surrealHttpBase } from './config'
import { rootCredentials } from '../startup-config'
import { BACKUP_LIMITS, byteLimit, regularFile, streamToFile } from './streams'

export interface ExportTableSelection { tables?: string[] }
export interface ImportStatementSummary { total: number, ok: number, errorCount: number, errors: string[] }
const RESPONSE_BYTES = 1024 * 1024

/** [] is SurrealDB 3.2 OPTION IMPORT acknowledgement, NOT verified row counts. */
export function summarizeStatementResults(body: unknown): ImportStatementSummary {
  if (!Array.isArray(body) || body.length > 10_000) throw new Error('Invalid database statement response')
  let ok = 0, errorCount = 0
  const errors: string[] = []
  for (const row of body) {
    if (!row || typeof row !== 'object' || !['OK', 'ERR'].includes(row.status)) throw new Error('Invalid database statement response')
    if (row.status === 'OK') ok++
    else {errorCount++; if (errors.length < 8) errors.push((typeof row.result === 'string' ? row.result : JSON.stringify(row.result ?? 'Statement failed')).slice(0, 300))}
  }
  return {total: body.length, ok, errorCount, errors}
}
function requestOptions(database?: string) {
  const config = useRuntimeConfig()
  const {username, password} = rootCredentials(config)
  if (database !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) throw new Error('Invalid backup database target')
  return { base: surrealHttpBase(config.surrealUrl), headers: {
    'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
    'Surreal-NS': config.surrealNamespace, 'Surreal-DB': database ?? config.surrealDatabase
  } }
}
function deadline(signal?: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, {once: true})
  if (signal?.aborted) abort()
  const timer = setTimeout(abort, BACKUP_LIMITS.deadlineMs)
  return {signal: controller.signal, abort, dispose: () => {clearTimeout(timer); signal?.removeEventListener('abort', abort)}}
}
async function responseJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Database HTTP response has no body')
  const chunks: Buffer[] = []
  let bytes = 0
  const reader = response.body.getReader()
  try {
    while (true) {
      const {value, done} = await reader.read()
      if (done) break
      bytes += value.length
      if (bytes > RESPONSE_BYTES) throw new Error('Database HTTP response byte budget exceeded')
      chunks.push(Buffer.from(value))
    }
    if (!response.ok) throw new Error(`Database HTTP request failed (${response.status})`)
    try {return JSON.parse(Buffer.concat(chunks).toString('utf8'))} catch {throw new Error('Malformed database HTTP response')}
  } finally {await reader.cancel().catch(() => {}); reader.releaseLock()}
}
function assertSuccess(body: unknown) {
  const summary = summarizeStatementResults(body)
  if (summary.errorCount) throw new Error(`Database import/SQL failed (${summary.errorCount} statement errors)`)
  return summary
}

export async function exportSurrealDb(selection?: ExportTableSelection, database?: string, signal?: AbortSignal): Promise<Readable> {
  const {base, headers} = requestOptions(database)
  const tables = selection?.tables ?? true
  if (Array.isArray(tables) && (tables.length > 200 || tables.some(t => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)))) throw new Error('Invalid export table selection')
  const timer = deadline(signal)
  let response: Response | undefined
  try {
    response = await fetch(`${base}/export`, {method: 'POST', redirect: 'error', signal: timer.signal,
      headers: {...headers, 'Content-Type': 'application/json', 'Accept': 'application/octet-stream'},
      body: JSON.stringify({users: true, accesses: true, params: true, functions: true, analyzers: true, versions: false, tables, records: true})})
    if (!response.ok || !response.body) throw new Error(`Database export failed (${response.status})`)
    const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>)
    const limited = byteLimit(BACKUP_LIMITS.sqlBytes)
    // pipeline propagates transport/limit failures and closes the fetch body.
    void pipeline(source, limited, {signal: timer.signal}).catch(error => limited.destroy(error))
    limited.once('close', () => {timer.abort(); timer.dispose()})
    limited.once('end', timer.dispose)
    return limited
  } catch (error) {timer.abort(); timer.dispose(); await response?.body?.cancel().catch(() => {}); throw error}
}
export async function exportSurrealDbToFile(target: string, selection?: ExportTableSelection, database?: string, signal?: AbortSignal): Promise<number> {
  return streamToFile(await exportSurrealDb(selection, database, signal), target, {signal})
}

/** Streaming duplex request; never concatenate SQL. The server may buffer it. */
export async function importSurrealDb(source: Readable | string, database?: string, signal?: AbortSignal): Promise<ImportStatementSummary> {
  const {base, headers} = requestOptions(database) // reject missing authority before allocating a file stream
  if (typeof source === 'string') await regularFile(source, BACKUP_LIMITS.sqlBytes)
  const input = typeof source === 'string' ? createReadStream(source) : source
  const timer = deadline(signal)
  const limited = byteLimit(BACKUP_LIMITS.sqlBytes)
  const pumping = pipeline(input, limited, {signal: timer.signal})
  void pumping.catch(() => {})
  let response: Response | undefined
  try {
    response = await fetch(`${base}/import`, {method: 'POST', redirect: 'error', signal: timer.signal,
      headers: {...headers, 'Content-Type': 'text/plain', 'Accept': 'application/json'}, body: limited as unknown as BodyInit, duplex: 'half'} as RequestInit)
    const body = await responseJson(response)
    await pumping
    return assertSuccess(body)
  } catch (error) {
    if (!response || timer.signal.aborted || !(error instanceof Error && /^(Malformed database HTTP response|Invalid database statement response|Database import\/SQL failed|Database HTTP request failed)/.test(error.message))) throw Object.assign(new Error('Database import transport failed; execution may continue'), {uncertain: true})
    throw error
  } finally {
    timer.abort(); timer.dispose(); input.destroy(); limited.destroy()
    await pumping.catch(() => {})
    await response?.body?.cancel().catch(() => {})
  }
}
export async function runSqlHttp(sql: string, database?: string, signal?: AbortSignal): Promise<unknown> {
  if (Buffer.byteLength(sql) > 64 * 1024) throw new Error('Maintenance SQL byte budget exceeded')
  const {base, headers} = requestOptions(database), timer = deadline(signal)
  let response: Response | undefined
  try {
    response = await fetch(`${base}/sql`, {method: 'POST', redirect: 'error', signal: timer.signal,
      headers: {...headers, 'Content-Type': 'text/plain', 'Accept': 'application/json'}, body: sql})
    const parsed = await responseJson(response)
    assertSuccess(parsed)
    return parsed
  } finally {timer.abort(); timer.dispose(); await response?.body?.cancel().catch(() => {})}
}
export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(filePath), hash)
  return hash.digest('hex')
}
