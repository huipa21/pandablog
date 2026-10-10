import { createError } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { applySettingsPatch, extractErrorContext, getErrorCauseChain, redactDeep, resolveErrorStatus, shouldAllowDebug, shouldCaptureHookError, trimByMaxSize } from '../../server/utils/logging-logic'
import type { LoggingSettings } from '../../types/logging'

function baseSettings(): LoggingSettings {
  return {
    enabled: true,
    debug_enabled: false,
    debug_override_prod: false,
    activity_log_enabled: true,
    error_log_enabled: true,
    error_log_min_status: 500,
    error_occurrences_per_group: 50,
    log_level: 'info',
    redact_fields: ['password', 'token', 'authorization', 'cookie'],
    retention_activity_days: 365,
    retention_error_days: 90,
    max_metadata_size_kb: 50,
    console_output: false,
    updated_at: '2026-05-19T00:00:00.000Z'
  }
}

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

describe('logging logic', () => {
  it('debug is disabled when override is false', () => {
    const settings = baseSettings()
    settings.debug_enabled = true
    settings.debug_override_prod = false

    expect(shouldAllowDebug(settings)).toBe(false)
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

  it('settings patch updates values and timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T00:00:00.000Z'))

    const settings = baseSettings()
    const previousUpdatedAt = settings.updated_at

    vi.setSystemTime(new Date('2026-05-19T00:00:01.000Z'))

    const updated = applySettingsPatch(settings, {
      log_level: 'warn',
      debug_override_prod: true
    })

    expect(updated.log_level).toBe('warn')
    expect(updated.debug_override_prod).toBe(true)
    expect(updated.updated_at).not.toBe(previousUpdatedAt)

    vi.useRealTimers()
  })
})
