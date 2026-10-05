import { createError } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { applySettingsPatch, extractErrorContext, getErrorCauseChain, isHealthCheckPath, mergeExcludedPaths, olderThanRetention, redactDeep, resolveErrorStatus, shouldAllowDebug, shouldCaptureHookError, shouldRecordAccessLog, trimByMaxSize } from '../../server/utils/logging-logic'
import type { LoggingSettings } from '../../types/logging'
import { DEFAULT_LOGGING_EXCLUDED_PATHS, parseExcludedStatusCodes } from '../../utils/loggingSettings'

function baseSettings(): LoggingSettings {
  return {
    enabled: true,
    debug_enabled: true,
    debug_override_prod: false,
    access_log_enabled: true,
    activity_log_enabled: true,
    error_log_enabled: true,
    error_log_min_status: 500,
    error_occurrences_per_group: 50,
    log_level: 'info',
    excluded_paths: [...DEFAULT_LOGGING_EXCLUDED_PATHS],
    excluded_status_codes: [204],
    redact_fields: ['password', 'token', 'authorization', 'cookie'],
    retention_access_days: 30,
    retention_activity_days: 365,
    retention_error_days: 90,
    max_metadata_size_kb: 1,
    sampling_rate: 1,
    console_output: false,
    updated_at: new Date().toISOString()
  }
}

describe('admin excluded-status form parsing', () => {
  it.each(['', ' ', '\n\t', ', ,'])('keeps empty/delimiter-only text %j empty instead of sending status 0', (value) => {
    expect(parseExcludedStatusCodes(value)).toEqual([])
  })

  it('parses comma and whitespace separators without creating extra statuses', () => {
    expect(parseExcludedStatusCodes(' 204, 304\n404,\t')).toEqual([204, 304, 404])
  })

  it('ignores non-numeric/non-integer tokens but leaves range validation to the API', () => {
    expect(parseExcludedStatusCodes('invalid, 204.5, 0, 99, 600, 200')).toEqual([0, 99, 600, 200])
  })
})

describe('error capture logic', () => {
  it.each([
    [399, 400, false], [400, 400, true], [401, 500, false], [404, 500, false],
    [499, 500, false], [500, 500, true], [500, 501, false], [599, 599, true]
  ])('captures status %i at threshold %i: %s', (status, minStatus, expected) => {
    expect(shouldCaptureHookError(status, minStatus)).toBe(expected)
  })

  it.each([
    [{ statusCode: 503, status: 404 }, 200, 503],
    [{ statusCode: null, status: 502 }, 200, 502],
    [{ status: 401 }, 500, 401],
    [{}, 404, 404],
    [new Error('oops'), undefined, 500],
    ['oops', undefined, 500],
    [null, undefined, 500],
    [{ statusCode: '404' }, 200, 500],
    [{ statusCode: Number.NaN }, 200, 500],
    [{ statusCode: 500.5 }, 200, 500],
    [{ statusCode: 99 }, 200, 500],
    [{ statusCode: 600 }, 200, 500]
  ])('resolves status with error/response/default precedence (%j, %s)', (error, responseStatus, expected) => {
    expect(resolveErrorStatus(error, responseStatus)).toBe(expected)
  })

  it('limits cause summaries to three stack-free levels', () => {
    const error = new Error('outer', { cause: new TypeError('one', { cause: new Error('two', { cause: new Error('three', { cause: new Error('four') }) }) }) })
    expect(getErrorCauseChain(error)).toEqual({ name: 'TypeError', message: 'one', cause: { name: 'Error', message: 'two', cause: { name: 'Error', message: 'three' } } })
  })

  it('handles primitive and error-like causes', () => {
    expect(getErrorCauseChain(new Error('outer', { cause: 'inner' }))).toEqual({ name: 'Error', message: 'inner' })
    expect(getErrorCauseChain({ cause: { name: 'CustomError', message: 'inner', stack: 'not retained', token: 'not retained' } })).toEqual({ name: 'CustomError', message: 'inner' })
    expect(getErrorCauseChain(new Error('no cause'))).toBeUndefined()
  })

  it('bounds circular causes and safely handles throwing getters', () => {
    const error = new Error('cycle')
    error.cause = error
    expect(getErrorCauseChain(error)).toEqual({ name: 'Error', message: 'cycle', cause: { name: 'Error', message: 'cycle', cause: { name: 'Error', message: 'cycle' } } })
    const exotic = { get cause() { throw new Error('getter failed') }, get statusCode() { throw new Error('getter failed') } }
    expect(getErrorCauseChain(exotic)).toBeUndefined()
    expect(resolveErrorStatus(exotic)).toBe(500)
  })

  it('extracts true H3 crash flags, not arbitrary truthy values', () => {
    expect(extractErrorContext(createError({ statusCode: 500, message: 'crash', unhandled: true, fatal: true, cause: new Error('inner') }))).toEqual({ cause: { name: 'Error', message: 'inner' }, unhandled: true, fatal: true })
    const intentional = extractErrorContext(createError({ statusCode: 500, message: 'intentional' }))
    expect(intentional.unhandled).toBeUndefined()
    expect(intentional.fatal).toBeUndefined()
    expect(extractErrorContext({ unhandled: 'yes', fatal: 1 })).toEqual({})
  })
})

describe('mergeExcludedPaths', () => {
  it('preserves custom entries and stored order, then appends missing defaults', () => {
    expect(mergeExcludedPaths(['/custom', '/_ipx', '/other'], ['/api/health', '/_ipx', '/_nuxt']))
      .toEqual(['/custom', '/_ipx', '/other', '/api/health', '/_nuxt'])
  })

  it('deduplicates both inputs by exact value, not by prefix coverage', () => {
    expect(mergeExcludedPaths(['/api', '/api', '/API'], ['/api/health', '/api', '/api/health']))
      .toEqual(['/api', '/API', '/api/health'])
  })

  it.each([
    [[], [], []],
    [[], ['/one', '/one', '/two'], ['/one', '/two']],
    [['/custom', '/custom'], [], ['/custom']]
  ])('handles empty inputs (%j, %j)', (stored, defaults, expected) => {
    expect(mergeExcludedPaths(stored, defaults)).toEqual(expected)
  })

  it('is idempotent and does not mutate or reuse its inputs', () => {
    const stored = ['/custom', '/_nuxt']
    const defaults = ['/api/health', '/_nuxt']
    const merged = mergeExcludedPaths(stored, defaults)
    expect(mergeExcludedPaths(merged, defaults)).toEqual(merged)
    expect(merged).not.toBe(stored)
    expect(merged).not.toBe(defaults)
    expect(stored).toEqual(['/custom', '/_nuxt'])
    expect(defaults).toEqual(['/api/health', '/_nuxt'])
  })
})

describe('logging logic', () => {
  it('debug is disabled when override is false', () => {
    const settings = baseSettings()
    settings.debug_enabled = true
    settings.debug_override_prod = false

    expect(shouldAllowDebug(settings)).toBe(false)
  })

  it('master switch disables access logging', () => {
    const settings = baseSettings()
    settings.enabled = false

    expect(shouldRecordAccessLog('/blog/hello', 200, settings, 0.01)).toBe(false)
  })

  it('excluded paths are not recorded', () => {
    const settings = baseSettings()

    expect(shouldRecordAccessLog('/_nuxt/chunk.js', 200, settings, 0.01)).toBe(false)
  })

  it.each(['/api/health', '/api/health/', '/api/health?db=1', '/api/health/?db=1'])('never records health probes even without configured exclusions (%s)', (path) => {
    const settings = { ...baseSettings(), excluded_paths: [] }
    expect(isHealthCheckPath(path)).toBe(true)
    expect(shouldRecordAccessLog(path, 200, settings, 0)).toBe(false)
    expect(shouldRecordAccessLog(path, 503, settings, 0)).toBe(false)
  })

  it.each(['/api/healthz', '/api/health-other', '/api/health/details'])('does not suppress unrelated health-like paths (%s)', (path) => {
    expect(isHealthCheckPath(path)).toBe(false)
    expect(shouldRecordAccessLog(path, 200, { ...baseSettings(), excluded_paths: [] }, 0)).toBe(true)
  })

  it.each([
    '/_nuxt/chunk.js', '/favicon.ico', '/api/admin/logs/access', '/api/health?db=1',
    '/api/analytics/track', '/_ipx/w_100/media/image', '/__nuxt_error?statusCode=500',
    '/_i18n/hash/en/messages.json'
  ])('excludes low-value paths by default (%s)', (path) => {
    expect(shouldRecordAccessLog(path, 200, baseSettings(), 0)).toBe(false)
  })

  it.each(['/posts/hello', '/api/posts', '/api/site/bootstrap', '/robots.txt', '/sitemap.xml'])('keeps visitor/API and nonexistent utility routes observable (%s)', (path) => {
    expect(shouldRecordAccessLog(path, 200, baseSettings(), 0)).toBe(true)
  })

  it('sampling rate controls recording probability threshold', () => {
    const settings = baseSettings()
    settings.sampling_rate = 0.2

    expect(shouldRecordAccessLog('/blog/hello', 200, settings, 0.19)).toBe(true)
    expect(shouldRecordAccessLog('/blog/hello', 200, settings, 0.2)).toBe(false)
  })

  it('redaction strips sensitive keys at nested depth', () => {
    const input = {
      user: {
        profile: {
          password: 'secret',
          token: 'abc'
        }
      },
      authorization: 'Bearer abc'
    }

    const result = redactDeep(input, baseSettings().redact_fields) as Record<string, any>

    expect(result.user.profile.password).toBe('[REDACTED]')
    expect(result.user.profile.token).toBe('[REDACTED]')
    expect(result.authorization).toBe('[REDACTED]')
  })

  it('size limit truncates large payloads', () => {
    const payload = { data: 'x'.repeat(5000) }
    const result = trimByMaxSize(payload, 1) as Record<string, unknown>

    expect(result._truncated).toBe(true)
  })

  it('retention helper identifies old records only', () => {
    const now = Date.parse('2026-05-19T00:00:00.000Z')

    expect(olderThanRetention('2026-05-10T00:00:00.000Z', 7, now)).toBe(true)
    expect(olderThanRetention('2026-05-15T00:00:00.000Z', 7, now)).toBe(false)
  })

  it('settings patch updates values and timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T00:00:00.000Z'))

    const settings = baseSettings()
    const previousUpdatedAt = settings.updated_at

    vi.setSystemTime(new Date('2026-05-19T00:00:01.000Z'))

    const updated = applySettingsPatch(settings, {
      sampling_rate: 0.5,
      debug_override_prod: true
    })

    expect(updated.sampling_rate).toBe(0.5)
    expect(updated.debug_override_prod).toBe(true)
    expect(updated.updated_at).not.toBe(previousUpdatedAt)

    vi.useRealTimers()
  })
})
