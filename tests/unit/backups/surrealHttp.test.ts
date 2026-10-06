import { describe, it, expect } from 'vitest'
import { surrealHttpBase } from '../../../server/utils/backups/config'
import { summarizeStatementResults } from '../../../server/utils/backups/surrealHttp'

describe('surrealHttpBase', () => {
  it('converts ws:// to http://', () => {
    expect(surrealHttpBase('ws://127.0.0.1:8000/rpc')).toBe('http://127.0.0.1:8000')
  })

  it('converts wss:// to https://', () => {
    expect(surrealHttpBase('wss://db.example.com/rpc')).toBe('https://db.example.com')
  })

  it('strips /rpc suffix', () => {
    expect(surrealHttpBase('ws://localhost:8000/rpc')).toBe('http://localhost:8000')
  })

  it('strips trailing slash', () => {
    expect(surrealHttpBase('ws://localhost:8000/')).toBe('http://localhost:8000')
  })

  it('passes through plain http:// url', () => {
    expect(surrealHttpBase('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000')
  })

  it('preserves port', () => {
    expect(surrealHttpBase('wss://mydb.host:9000/rpc')).toBe('https://mydb.host:9000')
  })
})

describe('summarizeStatementResults', () => {
  it('counts all-OK statements with no errors', () => {
    const body = [
      { status: 'OK', result: null, time: '1ms' },
      { status: 'OK', result: [], time: '2ms' },
    ]
    const summary = summarizeStatementResults(body)
    expect(summary.total).toBe(2)
    expect(summary.ok).toBe(2)
    expect(summary.errors).toEqual([])
  })

  it('collects ERR statement messages', () => {
    const body = [
      { status: 'OK', result: null, time: '1ms' },
      { status: 'ERR', result: 'There was a problem with the database', time: '3ms' },
    ]
    const summary = summarizeStatementResults(body)
    expect(summary.total).toBe(2)
    expect(summary.ok).toBe(1)
    expect(summary.errors).toEqual(['There was a problem with the database'])
  })

  it('stringifies non-string ERR results', () => {
    const body = [{ status: 'ERR', result: { code: 500 }, time: '1ms' }]
    const summary = summarizeStatementResults(body)
    expect(summary.errors).toEqual([JSON.stringify({ code: 500 })])
  })

  it.each([null, {}, [{result: 1}], [{status: 'unexpected'}]])('rejects malformed or unexpected statement results', body => {
    expect(() => summarizeStatementResults(body)).toThrow()
  })

  it('accepts only explicit empty acknowledgement and bounds error samples', () => {
    expect(summarizeStatementResults([])).toEqual({total: 0, ok: 0, errorCount: 0, errors: []})
    const summary = summarizeStatementResults(Array.from({length: 100}, () => ({status: 'ERR', result: 'x'.repeat(1000)})))
    expect(summary.errorCount).toBe(100)
    expect(summary.errors).toHaveLength(8)
    expect(summary.errors.every(error => error.length === 300)).toBe(true)
  })
})
