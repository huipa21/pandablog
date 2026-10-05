import { Writable } from 'node:stream'
import { RecordId } from 'surrealdb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectiveConsoleMode, formatJsonLine, formatPrettyLine, getConsoleConfig, MAX_CONSOLE_LINE_BYTES, resolveConsoleConfig, sanitizeLogContext } from '../../server/utils/log-console'
import type { ConsoleEntry } from '../../server/utils/log-console'

const entry: ConsoleEntry = {
  ts: '2026-05-20T10:12:03.123Z',
  level: 'error',
  kind: 'error_log',
  msg: 'Something broke',
  request_id: 'request-123',
  method: 'POST',
  path: '/api/posts',
  status: 500
}

function expectCapped(line: string) {
  expect(Buffer.byteLength(`${line}\n`)).toBeLessThanOrEqual(MAX_CONSOLE_LINE_BYTES)
  expect(line).not.toContain('\n')
  expect(() => JSON.parse(line)).not.toThrow()
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('console configuration', () => {
  it('defaults to errors and pretty outside production', () => {
    expect(resolveConsoleConfig({})).toEqual({ mode: 'errors', format: 'pretty' })
    expect(resolveConsoleConfig({ NODE_ENV: 'development' }).format).toBe('pretty')
    expect(resolveConsoleConfig({ NODE_ENV: 'production' })).toEqual({ mode: 'errors', format: 'json' })
  })

  it.each(['off', 'errors', 'all'] as const)('accepts mode %s and explicit formats', (mode) => {
    expect(resolveConsoleConfig({ LOG_CONSOLE: mode, LOG_FORMAT: 'json' })).toEqual({ mode, format: 'json' })
    expect(resolveConsoleConfig({ LOG_CONSOLE: mode, LOG_FORMAT: 'pretty', NODE_ENV: 'production' })).toEqual({ mode, format: 'pretty' })
  })

  it.each(['invalid', '', 'ALL'])('falls back for invalid values (%s) without side effects', (value) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveConsoleConfig({ LOG_CONSOLE: value, LOG_FORMAT: value, NODE_ENV: 'production' })).toEqual({ mode: 'errors', format: 'json' })
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns once per invalid variable at module load and caches the config', async () => {
    vi.resetModules()
    vi.stubEnv('LOG_CONSOLE', 'invalid')
    vi.stubEnv('LOG_FORMAT', 'invalid')
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sink = await import('../../server/utils/log-console')
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0]?.[0]).toContain('[logging] invalid LOG_CONSOLE=invalid')
    expect(warn.mock.calls[1]?.[0]).toContain('[logging] invalid LOG_FORMAT=invalid')
    vi.stubEnv('LOG_CONSOLE', 'all')
    vi.stubEnv('LOG_FORMAT', 'pretty')
    expect(sink.getConsoleConfig()).toEqual({ mode: 'errors', format: 'json' })
    sink.getConsoleConfig().mode = 'off'
    expect(sink.getConsoleConfig().mode).toBe('errors')
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('returns a config snapshot', () => {
    expect(getConsoleConfig()).toEqual(getConsoleConfig())
  })

  it.each([
    ['off', false, 'off'], ['off', true, 'off'],
    ['errors', false, 'errors'], ['errors', true, 'all'],
    ['all', false, 'all'], ['all', true, 'all']
  ] as const)('mode %s with console_output=%s becomes %s', (mode, toggle, expected) => {
    expect(effectiveConsoleMode(mode, toggle)).toBe(expected)
  })
})

describe('JSON console formatting', () => {
  it('keeps envelope order, UTC timestamp, and omits null/undefined fields', () => {
    const line = formatJsonLine({ ...entry, ts: new Date(entry.ts!), ip: null, ua: undefined, duration_ms: 0, ctx: { source: 'test', missing: null } })
    const data = JSON.parse(line)
    expect(Object.keys(data)).toEqual(['ts', 'level', 'kind', 'msg', 'request_id', 'method', 'path', 'status', 'duration_ms', 'ctx'])
    expect(data.ts).toBe(entry.ts)
    expect(data.duration_ms).toBe(0)
    expect(data.ctx).toEqual({ source: 'test' })
  })

  it('normalizes timestamps to ISO-8601 UTC', () => {
    expect(JSON.parse(formatJsonLine({ ...entry, ts: '2026-05-20T15:12:03.123+05:00' })).ts).toBe(entry.ts)
  })

  it('encodes multiline messages and stacks as a single physical line', () => {
    const error = new TypeError('first\nsecond')
    const line = formatJsonLine({ ...entry, msg: error.message, err: error })
    expectCapped(line)
    expect(JSON.parse(line).err).toEqual({ name: 'TypeError', message: error.message, stack: error.stack })
  })

  it('redacts nested metadata, configured fields, and error cause fields', () => {
    const line = formatJsonLine({
      ...entry,
      err: new Error('oops', { cause: new Error('secret cause') }),
      ctx: { Authorization: 'bearer secret', nested: [{ password: 'secret', apiKey: 'secret' }], token: 'secret' }
    }, { redact_fields: ['authorization', 'password', 'token', 'apiKey', 'message'] })
    const data = JSON.parse(line)
    expect(data.err.message).toBe('[REDACTED]')
    expect(data.err.cause.message).toBe('[REDACTED]')
    expect(data.ctx.nested[0]).toEqual({ password: '[REDACTED]', apiKey: '[REDACTED]' })
    expect(line).not.toContain('secret')
  })

  it('trims redacted context by the settings size limit', () => {
    const data = JSON.parse(formatJsonLine({ ...entry, ctx: { password: 'secret', data: 'x'.repeat(5000) } }, { max_metadata_size_kb: 1 }))
    expect(data.ctx._truncated).toBe(true)
    expect(data.ctx._preview).not.toContain('secret')
  })

  it('safely handles circular references, BigInt and real record-id objects', () => {
    const ctx: Record<string, unknown> = { number: 123n, id: new RecordId('posts', 'hello'), token: 'secret' }
    ctx.self = ctx
    const data = JSON.parse(formatJsonLine({ ...entry, ctx }))
    expect(data.ctx).toEqual({ number: '123', id: 'posts:hello', token: '[REDACTED]', self: '[Circular]' })
    expect(sanitizeLogContext(ctx)).toEqual(data.ctx)
  })

  it('redacts the result of toJSON, not just the original object', () => {
    const ctx = { toJSON: () => ({ password: 'secret' }) }
    expect(JSON.parse(formatJsonLine({ ...entry, ctx })).ctx).toEqual({ password: '[REDACTED]' })
  })

  it('falls back when getters or toJSON throw', () => {
    const ctx = { get broken() { throw new Error('broken getter') } }
    const data = JSON.parse(formatJsonLine({ ...entry, ctx }))
    expect(data).toMatchObject({ level: 'error', kind: 'app', msg: '[logging] unserializable entry' })
    expectCapped(formatJsonLine({ ...entry, ctx: { toJSON() { throw new Error('broken') } } }))
    expect(sanitizeLogContext(ctx)).toEqual({ _unserializable: true })
  })

  it('limits cause chains to three levels, omitting cause stacks', () => {
    let error = new Error('deepest')
    for (let i = 4; i >= 0; i--) {
      error = new Error(`level-${i}`, { cause: error })
    }
    const data = JSON.parse(formatJsonLine({ ...entry, err: error }))
    expect(data.err.cause).toEqual({ name: 'Error', message: 'level-1', cause: { name: 'Error', message: 'level-2', cause: { name: 'Error', message: 'level-3' } } })
    const cyclic = new Error('cycle')
    cyclic.cause = cyclic
    expectCapped(formatJsonLine({ ...entry, err: cyclic }))
  })

  it('truncates a large UTF-8 stack before sacrificing context', () => {
    const line = formatJsonLine({ ...entry, err: { name: 'Error', message: 'oops', stack: '调用😀\n'.repeat(10000) }, ctx: { keep: true } })
    expectCapped(line)
    const data = JSON.parse(line)
    expect(data.err.stack).toContain('[truncated]')
    expect(data.err.stack).not.toContain('\ufffd')
    expect(data.ctx).toEqual({ keep: true })
  })

  it('replaces oversized context after truncating the stack', () => {
    const line = formatJsonLine({ ...entry, err: { stack: 's'.repeat(20000), message: 'oops' }, ctx: { data: '字'.repeat(10000) } })
    expectCapped(line)
    const data = JSON.parse(line)
    expect(data.err.stack).toBe('[truncated]')
    expect(data.ctx).toEqual({ _truncated: true })
  })

  it('caps large messages, paths, UA and cause messages even without stack/context', () => {
    const huge = '\"😀\n'.repeat(10000)
    const line = formatJsonLine({ ...entry, msg: huge, path: huge, ua: huge, err: new Error(huge, { cause: new Error(huge) }) })
    expectCapped(line)
    expect(JSON.parse(line).kind).toBe('error_log')
  })

  it('does not mutate the original entry or metadata', () => {
    const ctx = { password: 'secret', stack: 'x'.repeat(20000) }
    formatJsonLine({ ...entry, ctx })
    expect(ctx.password).toBe('secret')
    expect(ctx.stack).toHaveLength(20000)
  })
})

describe('console stream safety', () => {
  it('swallows asynchronous stream errors and installs only one error listener', async () => {
    vi.resetModules()
    vi.stubEnv('LOG_CONSOLE', 'errors')
    vi.stubEnv('LOG_FORMAT', 'json')
    const stream = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('EPIPE'))
      }
    })
    vi.spyOn(process, 'stderr', 'get').mockReturnValue(stream as typeof process.stderr)
    const sink = await import('../../server/utils/log-console')
    expect(() => sink.writeConsoleEntry(entry)).not.toThrow()
    expect(() => sink.writeConsoleEntry(entry)).not.toThrow()
    await new Promise(resolve => setImmediate(resolve))
    expect(stream.listenerCount('error')).toBe(1)
  })
})

describe('pretty formatting', () => {
  it('never throws on ordinary or unserializable entries', () => {
    expect(() => formatPrettyLine({ ...entry, err: new Error('oops') })).not.toThrow()
    expect(() => formatPrettyLine({ ...entry, ctx: { toJSON() { throw new Error('broken') } } })).not.toThrow()
  })
})
