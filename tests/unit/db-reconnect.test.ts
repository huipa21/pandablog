import { afterEach, describe, expect, it, vi } from 'vitest'

interface MockSurrealClient {
  connect: ReturnType<typeof vi.fn>
  signin: ReturnType<typeof vi.fn>
  use: ReturnType<typeof vi.fn>
  query: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

async function loadDbModule() {
  vi.resetModules()

  const instances: MockSurrealClient[] = []

  vi.doMock('surrealdb', () => ({
    Surreal: class {
      connect = vi.fn().mockResolvedValue(undefined)
      signin = vi.fn().mockResolvedValue(undefined)
      use = vi.fn().mockResolvedValue(undefined)
      query = vi.fn().mockResolvedValue([['retried']])
      close = vi.fn().mockResolvedValue(undefined)

      constructor() {
        instances.push(this)
      }
    }
  }))

  vi.stubGlobal('useRuntimeConfig', () => ({
    surrealUrl: 'ws://surreal.test/rpc',
    surrealRoot: 'root',
    surrealRootPassword: 'root-password',
    surrealNamespace: 'main',
    surrealDatabase: 'main'
  }))
  vi.stubGlobal('createError', (options: { statusCode: number, message: string }) => {
    const error = new Error(options.message) as Error & { statusCode: number }
    error.statusCode = options.statusCode
    return error
  })

  const module = await import('../../server/utils/db')
  return { ...module, instances }
}

function staleClient(message: string) {
  return {
    query: vi.fn().mockRejectedValue(new Error(message)),
    close: vi.fn().mockResolvedValue(undefined)
  }
}

describe('queryDb reconnect retry policy', () => {
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.doUnmock('surrealdb')
  })

  it('retries write queries after an anonymous auth rejection', async () => {
    vi.useFakeTimers()

    const { queryDb, instances } = await loadDbModule()
    const db = staleClient('Anonymous access not allowed: Not enough permissions to perform this action')
    const sql = 'UPDATE app_settings SET value = $value WHERE key = $key;'
    const params = { key: 'site_title', value: 'PandaBlog' }

    const result = await queryDb(db as never, sql, params)

    expect(result).toEqual([['retried']])
    expect(db.query).toHaveBeenCalledWith(sql, params)
    expect(db.close).toHaveBeenCalledOnce()
    expect(instances).toHaveLength(1)
    const retryDb = instances[0]!
    expect(retryDb.connect).toHaveBeenCalledWith('ws://surreal.test/rpc')
    expect(retryDb.signin).toHaveBeenCalledWith({ username: 'root', password: 'root-password' })
    expect(retryDb.use).toHaveBeenCalledWith({ namespace: 'main', database: 'main' })
    expect(retryDb.query).toHaveBeenCalledWith(sql, params)
  })

  it('uses dedicated ROOT for schema work even when a runtime pool is already connected', async () => {
    vi.useFakeTimers()
    const { queryDb, useDb, connectRootClient, closeRootClient, instances } = await loadDbModule()
    const pool = await useDb()
    const root = await connectRootClient()
    await queryDb(root, 'DEFINE TABLE OVERWRITE access_logs SCHEMAFULL;', undefined, { label: 'schema repair' })
    expect(instances).toHaveLength(2)
    expect(instances[1]!.query).toHaveBeenCalledExactlyOnceWith('DEFINE TABLE OVERWRITE access_logs SCHEMAFULL;', undefined)
    expect(instances[0]!.query).not.toHaveBeenCalled()
    await closeRootClient(root)
    expect(instances[1]!.close).toHaveBeenCalledOnce()
    expect(await useDb()).toBe(pool)
  })

  it('does not retry a privileged failure via the lower-privilege pool', async () => {
    vi.useFakeTimers()
    const { queryDb, useDb, connectRootClient, instances } = await loadDbModule()
    const pool = await useDb()
    const root = await connectRootClient()
    instances[1]!.query.mockRejectedValue(new Error('Not enough permissions to perform this action'))
    await expect(queryDb(root, 'INFO FOR DB;')).rejects.toMatchObject({ statusCode: 503 })
    expect(instances[1]!.query).toHaveBeenCalledOnce()
    expect(instances[0]!.query).not.toHaveBeenCalled()
    expect(instances[0]!.close).not.toHaveBeenCalled()
    expect(await useDb()).toBe(pool)
  })

  it('does not retry write queries after a socket-level failure', async () => {
    vi.useFakeTimers()

    const { queryDb, instances } = await loadDbModule()
    const db = staleClient('websocket closed')

    await expect(queryDb(db as never, 'UPDATE app_settings SET value = $value;', { value: 'PandaBlog' }))
      .rejects
      .toMatchObject({ statusCode: 503, message: 'websocket closed' })

    expect(db.close).toHaveBeenCalledOnce()
    expect(instances).toHaveLength(0)
  })
})