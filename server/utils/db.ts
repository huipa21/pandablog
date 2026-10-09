import { Surreal } from 'surrealdb'
import { createError } from 'h3'
import { BoundedAdmission } from './admission'
import { firstRow } from './surrealResult'
import { writeBarrier } from './maintenance'
import { bootstrapCredentials, databaseIdentifier, rootCredentials, scopedCredentials } from './startup-config'

export interface QueryOptions {
  label?: string
  /** Response deadline only. Raw SDK queries have no per-query cancellation. */
  timeoutMs?: number
  /** Classification of the ENTIRE script; default is never replay. */
  retry?: 'never' | 'readOnly' | 'idempotent'
  /** Legacy false remains supported; true does not classify a query as safe. */
  retryOnReconnect?: boolean
  lane?: 'foreground' | 'background'
  signal?: AbortSignal
}

let client: Surreal | null = null
const rootClients = new WeakSet<Surreal>()
const ownedClients = new Set<Surreal>()
const pendingConnections = new Set<Surreal>()
let connectionPromise: Promise<Surreal> | null = null
let connectionGeneration = 0
let keepAliveTimer: ReturnType<typeof setInterval> | null = null
let probing = false
let stopped = false
let closing: Promise<void> | undefined
let failures = 0
let nextConnectAt = 0
let lastConnectError: Error | undefined
// Monotonic evidence, not SQL-text inference. After provisioning dispatch or
// handoff to application migrations/FS work, a later handshake is not proof
// that this initialization did nothing.
let initializationEffectsStarted = false
const handshakeFailures = new WeakSet<object>()
// Monotonic count of observed connectivity failures (handshake, transport,
// response deadline). Startup uses it to recognise a DB outage even when an
// initialization helper wraps the original error.
let connectivityFailures = 0
export function databaseConnectivityFailureCount() {return connectivityFailures}
// SDK 2.0.3 never settles calls still pending when close() is called
// explicitly (it only rejects them on an UNEXPECTED disconnect). Track our own
// in-flight executions so closing a client settles them and releases their
// admission slots/barrier leases instead of leaking them forever.
const inflight = new Map<Surreal, Set<(error: Error) => void>>()
class DatabaseClientClosedError extends Error {
  constructor() {super('Database connection closed before the response arrived')}
}
// The driver's own reconnect REPLAYS in-flight requests after reconnecting,
// which can execute a write twice. Reconnection is owned here instead. Note:
// the SDK treats `reconnect: false` as "use defaults"; only the object form
// actually disables it.
const CONNECT_OPTIONS = {reconnect: {enabled: false}} as const
function onDisconnected(db: Surreal, listener: () => void): (() => void) | undefined {
  return typeof db.subscribe === 'function' ? db.subscribe('disconnected', listener) : undefined
}

export function isPreMutationInitializationFailure(error: unknown): boolean {
  return !initializationEffectsStarted && typeof error === 'object' && error !== null && handshakeFailures.has(error)
}
const foreground = new BoundedAdmission({ active: 8, waiting: 32, waitMs: 2_000 }, 'Database foreground work')
const background = new BoundedAdmission({ active: 2, waiting: 8, waitMs: 2_000 }, 'Database background work')

export function databaseDiagnostics() {
  return { foreground: foreground.diagnostics(), background: background.diagnostics(), ownedClients: ownedClients.size, nextConnectAt, stopped }
}

function credentials(root: boolean) {
  const config = useRuntimeConfig()
  if (!root) {
    const {username, password} = scopedCredentials(config)
    return {scope: 'database', signin: {namespace: config.surrealNamespace, database: config.surrealDatabase, username, password}}
  }
  return {scope: 'root', signin: rootCredentials(config)}
}

/** Construction owns the socket, including late uncancellable connect completion. */
async function handshake(root: boolean, generation?: number): Promise<Surreal> {
  // Connection/auth/selection are side effects too; retain their lease.
  const release = writeBarrier.acquire()
  try {return await admittedHandshake(root, generation)} finally {release()}
}
async function admittedHandshake(root: boolean, generation?: number): Promise<Surreal> {
  if (stopped) throw new Error('Database is shutting down')
  const config = useRuntimeConfig()
  const identity = credentials(root)
  if (ownedClients.size >= 5) {connectivityFailures++; throw createError({ statusCode: 503, message: 'Database client capacity exceeded' })}
  const db = new Surreal()
  ownedClients.add(db)
  let abandoned = false
  const started = Date.now()
  let phase: 'connection' | 'authentication' | 'selection' = 'connection'
  const check = () => {
    if (abandoned || stopped || (generation !== undefined && generation !== connectionGeneration)) throw new Error('Discarded stale database handshake')
  }
  let unsubscribe: (() => void) | undefined
  try {
    pendingConnections.add(db)
    let connecting: Promise<unknown>
    try {connecting = Promise.resolve(db.connect(config.surrealUrl, CONNECT_OPTIONS))} catch (error) {pendingConnections.delete(db); throw error}
    // Keep the constructor's ownership budget even if close() resolves before
    // an uncancellable connect. Late allocation is closed, never orphaned.
    void connecting.then(() => {pendingConnections.delete(db); if (abandoned || stopped) return closeDbClient(db)}, () => {pendingConnections.delete(db); if (abandoned || stopped) return closeDbClient(db)}).catch(() => {})
    // An unreachable server never rejects connect(); its engine only emits
    // "disconnected". Fail fast instead of waiting for the full deadline.
    const refused = new Promise<never>((_, reject) => {
      unsubscribe = onDisconnected(db, () => reject(new Error('Database connection refused or closed')))
    })
    refused.catch(() => {})
    await withTimeout(Promise.race([connecting, refused]), 10_000, 'Database connection deadline exceeded')
    unsubscribe?.(); unsubscribe = undefined
    check()
    phase = 'authentication'
    await withTimeout(Promise.resolve(db.signin(identity.signin)), 10_000, 'Database authentication deadline exceeded')
    check()
    phase = 'selection'
    await withTimeout(Promise.resolve(db.use({ namespace: config.surrealNamespace, database: config.surrealDatabase })), 10_000, 'Database selection deadline exceeded')
    check()
    if (root) rootClients.add(db)
    else {
      client = db; startKeepAlive(); failures = 0; nextConnectAt = 0
      // Without driver reconnect, a dropped socket leaves a dead client. Drop
      // it immediately so the next request reconnects through useDb().
      onDisconnected(db, () => {if (client === db && !stopped) {connectivityFailures++; void discardDbConnection(db)}})
    }
    console.info(`[db] connected as ${identity.scope} in ${Date.now() - started}ms`)
    return db
  } catch {
    unsubscribe?.()
    abandoned = true
    connectivityFailures++
    await closeDbClient(db)
    // SDK handshake errors can echo credentials/endpoints. Never relay them.
    const error = createError({statusCode: 503, message: `Database handshake failed (${identity.scope} ${phase})`, data: {kind: 'database-handshake', scope: identity.scope, phase}})
    handshakeFailures.add(error)
    throw error
  }
}

export async function useDb(): Promise<Surreal> {
  if (stopped) throw createError({ statusCode: 503, message: 'Database is shutting down' })
  // Refuse before installing a shared promise/backoff. A pre-ready diagnostic
  // or detached caller must not poison the private boot flight with its own
  // admission rejection. Existing admitted work and private owners still pass.
  const admitted = writeBarrier.acquire()
  admitted()
  if (client) return client
  if (connectionPromise) return connectionPromise
  if (Date.now() < nextConnectAt) throw lastConnectError ?? new Error('Database reconnect backoff')
  const generation = ++connectionGeneration
  connectionPromise = handshake(false, generation).catch(error => {
    if (generation === connectionGeneration) {
      failures = Math.min(failures + 1, 8)
      nextConnectAt = Date.now() + Math.min(30_000, 250 * 2 ** (failures - 1)) * (1 + Math.random() * 0.2)
      lastConnectError = error
    }
    throw error
  }).finally(() => { if (generation === connectionGeneration) connectionPromise = null })
  return connectionPromise
}

function startKeepAlive() {
  if (keepAliveTimer || stopped) return
  keepAliveTimer = setInterval(() => { void probeConnection() }, 30_000)
  keepAliveTimer.unref?.()
}
async function probeConnection() {
  const probed = client
  const generation = connectionGeneration
  if (!probed || probing || stopped || writeBarrier.status().closed) return
  probing = true
  try {
    await runQuery(probed, 'INFO FOR DB', undefined, { timeoutMs: 5_000, lane: 'background', retry: 'readOnly' })
  } catch {
    if (probed === client && generation === connectionGeneration && !stopped) {
      await discardDbConnection(probed)
      void useDb().catch(() => {})
    }
  } finally { probing = false }
}
function stopKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer)
  keepAliveTimer = null
}

export async function queryDb<T extends unknown[] = unknown[]>(db: Surreal, sql: string, params?: Record<string, unknown>, options: QueryOptions = {}): Promise<T> {
  const started = Date.now()
  // Dedicated ROOT must never be rerouted through a runtime identity.
  let selected = client && client !== db && !rootClients.has(db) ? client : db
  try {
    try { return await runQuery<T>(selected, sql, params, options) }
    catch (error) {
      if (!rootClients.has(selected) && isConnectionError(error)) {
        await discardDbConnection(selected)
        if (options.retryOnReconnect !== false && (options.retry === 'readOnly' || options.retry === 'idempotent') && !options.signal?.aborted) {
          selected = await useDb()
          return await runQuery<T>(selected, sql, params, options)
        }
      }
      throw error
    }
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status) throw error
    const connectionError = isConnectionError(error)
    const deadline = error instanceof ResponseDeadlineError
    const serverTimeout = Boolean((error as {timeout?: unknown})?.timeout)
    throw createError({
      statusCode: connectionError ? 503 : deadline || serverTimeout ? 504 : 500,
      message: deadline ? 'Database response deadline exceeded' : connectionError ? isAuthRejectionError(error) ? 'Database authorization failed' : 'Database connection failed' : redactDatabaseError(error),
      data: { kind: deadline ? 'response-deadline' : serverTimeout ? 'server-timeout' : isAuthRejectionError(error) ? 'authorization' : connectionError ? 'connection' : 'query', uncertain: options.retry !== 'readOnly' && (deadline || connectionError) }
    })
  } finally {
    if (import.meta.dev && Date.now() - started > 750) console.warn(`[db] slow query (${Date.now() - started}ms): ${options.label ?? 'unlabelled operation'}`)
  }
}

class ResponseDeadlineError extends Error {}
async function runQuery<T extends unknown[] = unknown[]>(db: Surreal, sql: string, params: Record<string, unknown> | undefined, options: QueryOptions): Promise<T> {
  const ms = options.timeoutMs ?? 15_000
  if (!Number.isInteger(ms) || ms < 1 || ms > 300_000) throw new Error('Invalid database response deadline')
  const admission = options.lane === 'background' || writeBarrier.isBackground() || rootClients.has(db) ? background : foreground
  const releaseBarrier = writeBarrier.acquire()
  let releaseAdmission: () => void
  try { releaseAdmission = await admission.acquire(options.signal) } catch (error) {releaseBarrier(); throw error}
  const release = () => {releaseAdmission(); releaseBarrier()}
  let execution: Promise<T>
  try {
    if (options.signal?.aborted) throw new Error('Database operation aborted before execution')
    // Retain admission until actual SDK settlement, even after caller timeout.
    if (options.retry !== 'readOnly') initializationEffectsStarted = true
    const query = db.query(sql, params)
    const sdk = (typeof query.responses === 'function' ? collectResponses(query) : Promise.resolve(query)) as Promise<T>
    // Settle with the SDK, or when we close this client (see `inflight`).
    const calls = inflight.get(db) ?? new Set()
    inflight.set(db, calls)
    let orphan!: (error: Error) => void
    const tracked = new Promise<T>((resolve, reject) => {
      orphan = reject
      sdk.then(resolve, reject)
    }).finally(() => {calls.delete(orphan); if (!calls.size && inflight.get(db) === calls) inflight.delete(db)})
    calls.add(orphan)
    execution = tracked.catch(async error => {
      if (isConnectionError(error) || error instanceof ResponseDeadlineError) connectivityFailures++
      if (options.retry !== 'readOnly' && isPossiblyExecutedTransportFailure(error)) await writeBarrier.noteUncertain()
      throw error
    }).finally(release) as Promise<T>
  } catch (error) { release(); throw error }
  return withTimeout(execution, ms, 'Database response deadline exceeded', options.signal)
}

async function collectResponses(query: ReturnType<Surreal['query']>) {
  const responses = await query.responses()
  if (responses.length > 10_000) throw new Error('Database statement response count exceeded')
  const failures = responses.filter(response => !response.success)
  // SDK collect() throws the first cancelled statement, masking a later
  // business/constraint error. Inspect ALL responses without replaying work.
  const failure = failures.find(response => !response.success && !/(not executed due to a failed transaction|transaction was not successful|query was cancelled)/i.test(response.error.message)) ?? failures[0]
  if (failure && !failure.success) throw failure.error
  return responses.map(response => response.success ? response.result : undefined)
}

async function discardDbConnection(stale?: Surreal | null) {
  if (stale && client && stale !== client) { await closeDbClient(stale); return }
  if (!client && connectionPromise && stale) {await closeDbClient(stale); return}
  const old = stale ?? client
  connectionGeneration++
  client = null
  connectionPromise = null
  stopKeepAlive()
  await closeDbClient(old)
}

async function closeDbClient(db?: Surreal | null) {
  if (!db) return
  try {
    // SDK 2.0.3: close() terminates the engine and its socket. A connect()
    // that never reached the server stays pending forever but owns no socket,
    // so a resolved close() IS disposal. Retaining such clients exhausted the
    // 5-client budget during outages and blocked verified shutdown.
    await withTimeout(Promise.resolve(db.close()), 2_000, 'Database close deadline exceeded')
  } catch {
    // close() marks the engine terminated before it awaits the socket's close
    // handshake, which can hang on a black-holed network. The client can no
    // longer send anything; keeping it "owned" only leaked the client budget
    // and blocked recovery. Count it as a connectivity failure instead.
    connectivityFailures++
  }
  pendingConnections.delete(db)
  ownedClients.delete(db)
  // Responses for calls still pending on this socket can never arrive now.
  const calls = inflight.get(db)
  if (calls) {
    inflight.delete(db)
    for (const orphan of [...calls]) orphan(new DatabaseClientClosedError())
  }
}

export async function recycleRuntimeConnection() {
  await discardDbConnection()
  failures = 0; nextConnectAt = 0; lastConnectError = undefined
}
export function connectRootClient(): Promise<Surreal> { return handshake(true) }
export async function closeRootClient(db?: Surreal | null) { await closeDbClient(db) }

/** Stop admission first; preserve ownership of active work until settlement/close. */
export function shutdownDb(): Promise<void> {
  if (closing) return closing
  stopped = true
  connectionGeneration++
  stopKeepAlive()
  closing = (async () => {
    // Short grace for in-flight work, then close sockets: closing settles any
    // call stuck on a black-holed network instead of waiting for it forever.
    await Promise.all([foreground.shutdown(1_000), background.shutdown(1_000)])
    await Promise.all([...ownedClients].map(closeDbClient))
    await Promise.all([foreground.shutdown(1_000), background.shutdown(1_000)])
    client = null
  })()
  return closing
}

/** Optional, explicitly configured ROOT bootstrap only provisions the target
 * and identity. Dispose it BEFORE scoped authentication/schema/migrations.
 * An absent ROOT password is not an invitation to retry scoped failures as ROOT. */
export async function initializeRuntimeDatabase(): Promise<Surreal> {
  const config = useRuntimeConfig()
  scopedCredentials(config)
  const namespace = databaseIdentifier(config.surrealNamespace, 'NUXT_SURREAL_NAMESPACE')
  const database = databaseIdentifier(config.surrealDatabase, 'NUXT_SURREAL_DATABASE')
  if (bootstrapCredentials(config)) {
    let root: Surreal | undefined
    try {
      root = await connectRootClient()
      try {
        await queryDb(root, `DEFINE NAMESPACE IF NOT EXISTS ${namespace}; DEFINE DATABASE IF NOT EXISTS ${database};`, undefined, {label: 'bootstrap database target', timeoutMs: 10_000, retry: 'never'})
      } catch {throw new Error('Could not provision the SurrealDB namespace/database')}
      await provisionAppDatabaseUser(root, {overwrite: false})
    } finally {
      await closeBootstrapRootClient(root)
    }
  }
  const runtime = await useDb()
  // Application initialization can now mutate files as well as the DB. Do
  // not classify later failures as a harmless pre-mutation handshake failure.
  initializationEffectsStarted = true
  return runtime
}

async function closeBootstrapRootClient(root?: Surreal) {
  await closeRootClient(root)
  if (root && ownedClients.has(root)) throw new Error('Bootstrap ROOT disposal is incomplete')
}

/** Normal bootstrap only creates a missing identity. Restore/explicit
 * credential refresh retains deliberate overwrite, never automatic auth repair. */
export async function provisionAppDatabaseUser(rootDb: Surreal, options: {overwrite?: boolean} = {}): Promise<boolean> {
  const config = useRuntimeConfig()
  const {username: user, password} = scopedCredentials(config)
  const literal = `"${password.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  try {
    const mode = options.overwrite === false ? 'IF NOT EXISTS' : 'OVERWRITE'
    await queryDb(rootDb, `DEFINE USER ${mode} ${user} ON DATABASE PASSWORD ${literal} ROLES EDITOR;`, undefined, { label: 'provision scoped runtime identity', timeoutMs: 10_000, retry: 'never' })
  } catch {
    // No raw/escaped password, SQL or nested SDK cause escapes this boundary.
    throw new Error('Could not provision the scoped SurrealDB runtime user')
  }
  return true
}

function errorMessage(error: unknown) {
  const value = error as { message?: string, cause?: { message?: string } }
  return [value?.message, value?.cause?.message].filter((entry): entry is string => typeof entry === 'string').join(' ')
}
function redactDatabaseError(error: unknown) {
  let message = errorMessage(error) || 'Database query failed'
  const config = typeof useRuntimeConfig === 'function' ? useRuntimeConfig() : {surrealRootPassword: undefined, surrealAppPassword: undefined}
  for (const secret of [config.surrealRootPassword, config.surrealAppPassword]) {
    if (typeof secret !== 'string' || !secret) continue
    for (const form of [secret.replace(/\\/g, '\\\\').replace(/"/g, '\\"'), secret]) message = message.split(form).join('***')
  }
  return message.slice(0, 1_000)
}
function isAuthRejectionError(error: unknown) {
  const kind = (error as {kind?: string})?.kind
  return (!kind || kind === 'NotAllowed') && /(anonymous access not allowed|not enough permissions to perform this action|token.*expired|invalid.*authentication)/i.test(errorMessage(error))
}
function isConnectionError(error: unknown) {
  if (error instanceof DatabaseClientClosedError) return true
  if (isAuthRejectionError(error)) return true
  const kind = (error as {kind?: string})?.kind
  // Structured server replies prove execution settled. A user THROW or field
  // named "socket" is not a transport failure or authorization rejection.
  if (kind && kind !== 'Connection') return false
  return /(websocket|socket|connection|disconnect|not open|closed|network|transport|broken pipe|econn|ehost|enet|eai_again|enotfound|must be connected|not connected)/i.test(errorMessage(error))
}
/** A transport failure AFTER the request may have reached the server. An
 * authorization rejection is a definitive server reply, and the SDK raises
 * ConnectionUnavailableError before sending anything; neither is uncertain. */
function isPossiblyExecutedTransportFailure(error: unknown) {
  if (!isConnectionError(error) || isAuthRejectionError(error)) return false
  return (error as {name?: string})?.name !== 'ConnectionUnavailableError'
}
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new ResponseDeadlineError(message)), ms)
      abort = () => reject(new ResponseDeadlineError('Database caller aborted; execution may continue'))
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })])
  } finally {
    if (timer) clearTimeout(timer)
    if (abort) signal?.removeEventListener('abort', abort)
  }
}

export async function queryDbRecord<T extends Record<string, unknown> = Record<string, unknown>>(db: Surreal, table: string, id: string, options: QueryOptions = {}) {
  const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', { table, id }, { retry: 'readOnly', ...options })
  return firstRow<T>(response)
}
export async function findBySlug<T extends { id: unknown } = { id: unknown }>(db: Surreal, table: string, slug: string, options: QueryOptions = {}) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw createError({ statusCode: 500, message: 'Invalid database table name' })
  const response = await queryDb(db, `SELECT id FROM ${table} WHERE slug = $slug LIMIT 1;`, { slug }, { retry: 'readOnly', ...options })
  return firstRow<T>(response)
}
