import { afterEach, describe, expect, it, vi } from 'vitest'

function deferred<T>() {
  let resolve!: (value?: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = value => yes(value as T); reject = no })
  return { promise, resolve, reject }
}

async function load(fail?: 'connect' | 'signin' | 'use', connection?: Promise<void>) {
  vi.resetModules()
  const instances: { connect: ReturnType<typeof vi.fn>, signin: ReturnType<typeof vi.fn>, use: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn>, query: ReturnType<typeof vi.fn> }[] = []
  vi.doMock('surrealdb', () => ({ Surreal: class {
    connect = vi.fn(() => fail === 'connect' ? Promise.reject(new Error('connect failure')) : connection ?? Promise.resolve())
    signin = vi.fn(() => fail === 'signin' ? Promise.reject(new Error('signin failure')) : Promise.resolve())
    use = vi.fn(() => fail === 'use' ? Promise.reject(new Error('use failure')) : Promise.resolve())
    close = vi.fn().mockResolvedValue(undefined)
    query = vi.fn().mockResolvedValue([1])
    constructor() { instances.push(this) }
  } }))
  vi.stubGlobal('useRuntimeConfig', () => ({ surrealUrl: 'ws://fixture.invalid/rpc', surrealRoot: 'fixture', surrealRootPassword: 'secret', surrealNamespace: 'fixture', surrealDatabase: 'fixture' }))
  vi.stubGlobal('createError', (options: object) => Object.assign(new Error(), options))
  const db = await import('../../server/utils/db')
  return { ...db, instances }
}

describe('owned database lifecycle', () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.doUnmock('surrealdb') })

  it.each(['connect', 'signin', 'use'] as const)('closes failed %s clients and bounds reconnect storms', async fail => {
    vi.useFakeTimers()
    const { useDb, connectRootClient, instances } = await load(fail)
    await expect(useDb()).rejects.toThrow()
    expect(instances[0]!.close).toHaveBeenCalledOnce()
    await Promise.allSettled(Array.from({ length: 20 }, () => useDb()))
    expect(instances).toHaveLength(1)
    await expect(connectRootClient()).rejects.toThrow()
    expect(instances[1]!.close).toHaveBeenCalledOnce()
  })

  it('closes again when an uncancellable connection completes after its deadline', async () => {
    vi.useFakeTimers()
    const pending = deferred<undefined>()
    const { useDb, instances } = await load(undefined, pending.promise)
    const attempt = expect(useDb()).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(10_001)
    await attempt
    expect(instances[0]!.close).toHaveBeenCalled()
    pending.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(instances[0]!.close).toHaveBeenCalledTimes(2)
    expect(instances[0]!.signin).not.toHaveBeenCalled()
  })

  it('keeps timed-out execution admitted, never retries it, and rejects overflow', async () => {
    vi.useFakeTimers()
    const { useDb, queryDb, instances, databaseDiagnostics, shutdownDb } = await load()
    const db = await useDb()
    const late = deferred<unknown[]>()
    instances[0]!.query.mockReturnValue(late.promise)
    const results = Array.from({ length: 8 }, () => queryDb(db, 'CREATE item;', undefined, { timeoutMs: 10 }).catch(error => error))
    await vi.advanceTimersByTimeAsync(11)
    expect((await Promise.all(results)).every(error => error.data?.uncertain === true)).toBe(true)
    expect(databaseDiagnostics().foreground.active).toBe(8)
    const waiting = Array.from({ length: 32 }, () => queryDb(db, 'RETURN 1;').catch(error => error))
    await expect(queryDb(db, 'RETURN 1;')).rejects.toMatchObject({ statusCode: 429 })
    expect(instances[0]!.query).toHaveBeenCalledTimes(8)
    late.resolve([1])
    await vi.advanceTimersByTimeAsync(0)
    await Promise.all(waiting)
    expect(databaseDiagnostics().foreground.active).toBe(0)
    await shutdownDb()
  })

  it('deduplicates handshakes and shutdown, rejects new work, and has bounded close', async () => {
    vi.useFakeTimers()
    const { useDb, connectRootClient, shutdownDb, instances } = await load()
    const clients = await Promise.all(Array.from({ length: 20 }, () => useDb()))
    expect(new Set(clients).size).toBe(1)
    await connectRootClient()
    instances[0]!.close.mockReturnValue(new Promise(() => {}))
    const done = Promise.all([shutdownDb(), shutdownDb()])
    await vi.advanceTimersByTimeAsync(2_001)
    await done
    expect(instances[0]!.close).toHaveBeenCalledOnce()
    expect(instances[1]!.close).toHaveBeenCalledOnce()
    await expect(useDb()).rejects.toThrow()
    await expect(connectRootClient()).rejects.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not let a late stale keepalive failure discard a replacement', async () => {
    vi.useFakeTimers()
    const { useDb, queryDb, instances, shutdownDb } = await load()
    const old = await useDb()
    const probe = deferred<unknown[]>()
    instances[0]!.query.mockImplementation((sql: string) => sql === 'INFO FOR DB' ? probe.promise : Promise.reject(new Error('websocket closed')))
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(queryDb(old, 'RETURN 1;')).rejects.toThrow()
    const replacement = await useDb()
    probe.reject(new Error('late websocket close'))
    await vi.advanceTimersByTimeAsync(0)
    expect(await useDb()).toBe(replacement)
    expect(instances[1]!.close).not.toHaveBeenCalled()
    await shutdownDb()
  })
})
