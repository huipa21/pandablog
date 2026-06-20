import { appendFile, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { queryDb, useDb } from './db'

/**
 * Access logs are by far the highest-volume log stream — one row per HTTP
 * request. Writing each entry to SurrealDB individually floods the database
 * with tiny round-trips. Instead we append entries to a local NDJSON file and
 * bulk-insert them into `access_logs` in batches, either when an admin views
 * the logs, when the buffer grows past a threshold, or on a periodic timer.
 */

const BUFFER_DIR = resolve(process.cwd(), 'storage/logs')
const BUFFER_PATH = resolve(BUFFER_DIR, 'access-buffer.ndjson')

// Soft cap: once this many entries have been appended since the last flush,
// kick off a background flush so the file never grows without bound.
const FLUSH_LINE_THRESHOLD = 2000
// SurrealDB INSERT batch size — keeps a single statement payload reasonable.
const BULK_BATCH_SIZE = 500
// Back off DB writes for a while after a flush failure (mirrors the logging
// circuit breaker) so a dead socket doesn't get hammered every request.
const FLUSH_DB_BLOCK_MS = 60_000

let appendChain: Promise<void> = Promise.resolve()
let bufferedSinceFlush = 0
let flushing: Promise<number> | null = null
let dirReady = false
let dbBlockedUntil = 0

/**
 * Queue an access-log entry for buffered, batched persistence. The entry is the
 * already-sanitised/compacted DB payload (timestamp may be a `Date`).
 */
export function bufferAccessLog(entry: Record<string, unknown>) {
  const line = `${JSON.stringify(serializeEntry(entry))}\n`

  appendChain = appendChain
    .then(async () => {
      await ensureDir()
      await appendFile(BUFFER_PATH, line, 'utf8')
      bufferedSinceFlush += 1
    })
    .catch((error) => {
      console.warn(`[logging] access buffer append failed (${describe(error)})`)
    })

  if (bufferedSinceFlush >= FLUSH_LINE_THRESHOLD) {
    bufferedSinceFlush = 0
    void flushAccessBuffer().catch(() => {})
  }
}

/**
 * Bulk-load any buffered access-log entries into SurrealDB. Safe to call
 * concurrently — overlapping calls share the same in-flight flush. Returns the
 * number of rows inserted.
 */
export function flushAccessBuffer(): Promise<number> {
  if (flushing) {
    return flushing
  }

  flushing = doFlush().finally(() => {
    flushing = null
  })

  return flushing
}

async function doFlush(): Promise<number> {
  if (Date.now() < dbBlockedUntil) {
    return 0
  }

  // Atomically claim the current buffer by renaming it through the append
  // chain, so in-flight and future appends land in a fresh file.
  const tempPath = `${BUFFER_PATH}.${Date.now()}.flushing`
  let claimed = false

  const claim = appendChain.then(async () => {
    try {
      await rename(BUFFER_PATH, tempPath)
      claimed = true
      bufferedSinceFlush = 0
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  })
  appendChain = claim.catch(() => {})
  await claim

  if (!claimed) {
    return 0
  }

  let content: string
  try {
    content = await readFile(tempPath, 'utf8')
  } catch {
    return 0
  }

  const lines = content.split('\n').filter(line => line.trim().length > 0)
  if (!lines.length) {
    await rm(tempPath, { force: true }).catch(() => {})
    return 0
  }

  const rows = lines.map(parseLine).filter((row): row is Record<string, unknown> => row !== null)

  let inserted = 0
  try {
    const db = await useDb()
    for (let index = 0; index < rows.length; index += BULK_BATCH_SIZE) {
      const batch = rows.slice(index, index + BULK_BATCH_SIZE)
      await queryDb(
        db,
        'INSERT INTO access_logs $rows;',
        { rows: batch },
        { label: 'access logs bulk insert', timeoutMs: 20_000, retryOnReconnect: false }
      )
      inserted += batch.length
    }
    await rm(tempPath, { force: true }).catch(() => {})
  } catch (error) {
    dbBlockedUntil = Date.now() + FLUSH_DB_BLOCK_MS
    // Re-queue lines that were never inserted so they are retried on the next
    // flush instead of being lost. Parsed-but-malformed lines are dropped.
    const remaining = lines.slice(inserted)
    if (remaining.length) {
      requeue(remaining)
    }
    await rm(tempPath, { force: true }).catch(() => {})
    console.warn(`[logging] access buffer flush failed after ${inserted} rows (${describe(error)})`)
  }

  return inserted
}

function requeue(lines: string[]) {
  const block = `${lines.join('\n')}\n`
  appendChain = appendChain
    .then(async () => {
      await ensureDir()
      await appendFile(BUFFER_PATH, block, 'utf8')
    })
    .catch(() => {})
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>
    if (typeof parsed.timestamp === 'string') {
      const date = new Date(parsed.timestamp)
      if (!Number.isNaN(date.getTime())) {
        parsed.timestamp = date
      }
    }
    return parsed
  } catch {
    return null
  }
}

function serializeEntry(entry: Record<string, unknown>) {
  const timestamp = entry.timestamp
  if (timestamp instanceof Date) {
    return { ...entry, timestamp: timestamp.toISOString() }
  }
  return entry
}

async function ensureDir() {
  if (dirReady) {
    return
  }
  await mkdir(BUFFER_DIR, { recursive: true })
  dirReady = true
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error'
}
