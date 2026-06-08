import { Surreal } from 'surrealdb'
import { firstRow } from './surrealResult'

interface QueryOptions {
  label?: string
  timeoutMs?: number
  retryOnReconnect?: boolean
}

let client: Surreal | null = null
let connectionPromise: Promise<Surreal> | null = null
let connectionGeneration = 0
let keepAliveTimer: ReturnType<typeof setInterval> | null = null

const KEEP_ALIVE_INTERVAL_MS = 30_000

async function connectDb(generation: number) {
  const config = useRuntimeConfig()
  const db = new Surreal()

  await withTimeout(db.connect(config.surrealUrl), 10_000, `Could not connect to SurrealDB at ${config.surrealUrl}`)
  await withTimeout(db.signin({
    username: config.surrealRoot,
    password: config.surrealRootPassword
  }), 10_000, 'Could not authenticate with SurrealDB')
  await withTimeout(db.use({
    namespace: config.surrealNamespace,
    database: config.surrealDatabase
  }), 10_000, 'Could not select SurrealDB namespace/database')

  if (generation !== connectionGeneration) {
    await closeDbClient(db)
    throw new Error('Discarded stale SurrealDB connection attempt')
  }

  client = db
  startKeepAlive()
  return db
}

function startKeepAlive() {
  if (keepAliveTimer) {
    return
  }

  keepAliveTimer = setInterval(async () => {
    if (!client) {
      stopKeepAlive()
      return
    }

    try {
      await withTimeout(client.query('RETURN 1'), 5_000, 'keep-alive timed out')
    } catch (error: any) {
      if (import.meta.dev) {
        console.warn('[db] keep-alive failed, resetting connection:', error?.message)
      }

      await discardDbConnection(client)
      stopKeepAlive()
      // Proactively reconnect so the next request doesn't pay the reconnect cost.
      useDb().catch(() => {})
    }
  }, KEEP_ALIVE_INTERVAL_MS)
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }
}

export async function useDb() {
  if (client) {
    return client
  }

  if (!connectionPromise) {
    const generation = ++connectionGeneration
    connectionPromise = connectDb(generation).catch((error) => {
      if (generation === connectionGeneration) {
        connectionPromise = null
      }
      throw error
    })
  }

  return connectionPromise
}

export async function queryDb<T extends unknown[] = unknown[]>(db: Surreal, sql: string, params?: Record<string, unknown>, options: QueryOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15_000
  const label = options.label ?? summarizeQuery(sql)
  const startedAt = Date.now()
  let queryClient = resolveQueryClient(db)

  try {
    return await runQuery<T>(queryClient, sql, params, timeoutMs, label)
  } catch (error: any) {
    let failure = error

    if (options.retryOnReconnect !== false && isConnectionError(error)) {
      await discardDbConnection(queryClient)

      if (isReadOnlyQuery(sql)) {
        try {
          queryClient = await useDb()
          const result = await runQuery<T>(queryClient, sql, params, timeoutMs, label)

          if (import.meta.dev) {
            console.warn(`[db] recovered connection and retried query: ${label}`)
          }

          return result as T
        } catch (retryError: any) {
          failure = retryError
        }
      }
    }

    const message = failure?.message ?? 'Database query failed'
    const statusCode = isConnectionError(failure)
      ? 503
      : message.includes('timed out')
        ? 504
        : 500
    throw createError({ statusCode, message })
  } finally {
    const elapsed = Date.now() - startedAt
    if (import.meta.dev && elapsed > 750) {
      console.warn(`[db] slow query (${elapsed}ms): ${label}`)
    }
  }
}

async function runQuery<T extends unknown[] = unknown[]>(db: Surreal, sql: string, params: Record<string, unknown> | undefined, timeoutMs: number, label: string): Promise<T> {
  const result = await withTimeout(
    db.query<T>(sql, params) as Promise<T>,
    timeoutMs,
    `Database query timed out after ${timeoutMs}ms: ${label}`
  )

  return result as T
}

function resolveQueryClient(db: Surreal) {
  return client && client !== db ? client : db
}

async function discardDbConnection(staleClient?: Surreal | null) {
  if (staleClient && client && staleClient !== client) {
    return
  }

  const activeClient = staleClient ?? client
  connectionGeneration += 1
  client = null
  connectionPromise = null
  stopKeepAlive()
  await closeDbClient(activeClient)
}

async function closeDbClient(db: Surreal | null | undefined) {
  if (!db) {
    return
  }

  const closable = db as Surreal & { close?: () => Promise<void> | void }

  try {
    await closable.close?.()
  } catch {
    // Ignore close failures while discarding a broken connection.
  }
}

function isReadOnlyQuery(sql: string) {
  return /^\s*(SELECT|INFO|RETURN)\b/i.test(sql)
}

function isConnectionError(error: unknown) {
  const value = error as { message?: string, cause?: { message?: string } }
  const message = [value?.message, value?.cause?.message]
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .join(' ')

  // Also matches the SurrealDB SDK's own phrasing:
  // "You must be connected to a SurrealDB instance before performing this operation"
  return /(websocket|socket|connection|disconnect|not open|closed|network|transport|broken pipe|econn|ehost|enet|eai_again|enotfound|must be connected|not connected)/i.test(message)
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), ms)
      })
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

function summarizeQuery(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 120)
}

export async function queryDbRecord<T extends Record<string, unknown> = Record<string, unknown>>(
  db: Surreal,
  table: string,
  id: string,
  options: QueryOptions = {}
) {
  const response = await queryDb(
    db,
    'SELECT * FROM type::record($table, $id) LIMIT 1;',
    { table, id },
    options
  )

  return firstRow<T>(response)
}

export async function findBySlug<T extends { id: unknown } = { id: unknown }>(
  db: Surreal,
  table: string,
  slug: string,
  options: QueryOptions = {}
) {
  const tableName = safeTableName(table)
  const response = await queryDb(
    db,
    `SELECT id FROM ${tableName} WHERE slug = $slug LIMIT 1;`,
    { slug },
    options
  )

  return firstRow<T>(response)
}

function safeTableName(table: string) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    return table
  }

  throw createError({ statusCode: 500, message: 'Invalid database table name' })
}