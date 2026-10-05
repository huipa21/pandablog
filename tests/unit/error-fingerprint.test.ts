import { describe, expect, it } from 'vitest'
import { errorFingerprint, normalizeMessage, normalizeRoute, topAppFrame } from '../../server/utils/error-fingerprint'

describe('error fingerprint v1', () => {
  it('normalizes variable UUIDs, record ids, hex, numbers, long quotes and whitespace', () => {
    expect(normalizeMessage('Record post:⟨one-two⟩ 123 failed for 8d69c8bb-6e98-4554-9494-f35c6418c1b1, deadbeefabcd\n "abcdefghijklmnopqrstuvwxyz0123456789"')).toBe('Record <rid> <n> failed for <uuid>, <hex> <str>')
    expect(normalizeMessage('post:abc123 user:`some-id` 12.34')).toBe('<rid> <rid> <n>')
    expect(normalizeMessage('x'.repeat(400))).toHaveLength(300)
  })
  it('groups the same bug despite ids, numbers and UUIDs', () => {
    const make = (id: string, uuid: string, n: number) => errorFingerprint({ message: `Post post:${id} ${uuid} failed ${n}`, path: '/api/posts/42', status: 503 })
    expect(make('abc', '8d69c8bb-6e98-4554-9494-f35c6418c1b1', 1)).toBe(make('xyz', '6fcda824-c790-4ca8-82c7-13b7b7c7889b', 999))
  })
  it('uses the first application frame, stripping absolute prefixes and coordinates', () => {
    expect(topAppFrame('Error: test\n at internal (node:internal/process:12:3)\n at vendor (/app/node_modules/pkg.js:1:2)\n at run (/home/app/server/api/test.ts:12:34)')).toBe('at run (/server/api/test.ts)')
    expect(topAppFrame('Error\n at run (C:\\build\\.output\\server\\chunks\\min.mjs:1:340)')).toBe('at run (/.output/server/chunks/min.mjs)')
    expect(topAppFrame('Error\n at foo (native)')).toBeNull()
    expect(topAppFrame(null)).toBeNull()
  })
  it('normalizes routes and falls back to them only without an app frame', () => {
    expect(normalizeRoute('/api/posts/post%3Aabc123/123/deadbeef?token=secret')).toBe('/api/posts/:id/:id/:id')
    expect(normalizeRoute('/api/8d69c8bb-6e98-4554-9494-f35c6418c1b1')).toBe('/api/:id')
    expect(normalizeRoute('/api/posts/latest')).toBe('/api/posts/latest')
    expect(normalizeRoute(null)).toBeNull()
    expect(errorFingerprint({ message: 'bad', path: '/one' })).not.toBe(errorFingerprint({ message: 'bad', path: '/two' }))
    expect(errorFingerprint({ message: 'bad', stack: 'Error\n at a (/app/server/one.ts:1:2)', path: '/one' })).toBe(errorFingerprint({ message: 'bad', stack: 'Error\n at a (/other/server/one.ts:3:4)', path: '/two' }))
    expect(errorFingerprint({ message: 'bad', stack: 'Error\n at a (/app/server/one.ts:1:2)' })).not.toBe(errorFingerprint({ message: 'bad', stack: 'Error\n at a (/app/server/two.ts:1:2)' }))
  })
  it('has a fixed hash contract and one 5xx bucket, distinct names and 4xx statuses', () => {
    expect(errorFingerprint({ message: 'Database unavailable', path: '/api/posts/42', status: 503 })).toBe('aa1b60c1ab7f72a1')
    expect(errorFingerprint({ message: 'bad', status: 500 })).toBe(errorFingerprint({ message: 'bad', status: 503 }))
    expect(errorFingerprint({ message: 'bad', status: 401 })).not.toBe(errorFingerprint({ message: 'bad', status: 404 }))
    expect(errorFingerprint({ name: 'TypeError', message: 'bad' })).not.toBe(errorFingerprint({ name: 'Error', message: 'bad' }))
  })
})
