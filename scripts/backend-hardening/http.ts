import { createReadStream } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Fixture } from './fixture'
import { assertFixtureTarget } from './fixture'

export async function boundedText(response: Response, maxBytes = 64 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 1024 * 1024) throw new Error('Invalid fixture HTTP byte budget')
  if (!response.body) throw new Error('Missing fixture HTTP response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let result = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) throw new Error('Fixture HTTP response exceeded byte budget')
      result += decoder.decode(value, { stream: true })
    }
    return result + decoder.decode()
  } finally { await reader.cancel(); reader.releaseLock() }
}

/** Import mode suppresses statement output: [] is valid, not a row count.
 * Callers must independently verify the generated fixture through the SDK.
 */
export function importStatementCount(text: string) {
  if (Buffer.byteLength(text) > 64 * 1024) throw new Error('Fixture HTTP response exceeded byte budget')
  let results: unknown
  try { results = JSON.parse(text) } catch { throw new Error('Fixture HTTP import returned invalid JSON') }
  if (!Array.isArray(results) || results.some(result => !result || result.status !== 'OK')) throw new Error('Fixture HTTP import returned non-OK statement')
  return results.length
}

/** HTTP import accepts only a filename inside this owned fixture capability. */
export async function importFixture(fixture: Fixture, name: string) {
  assertFixtureTarget(fixture.endpoint, fixture.namespace, fixture.database)
  await fixture.storage.verify()
  const path = fixture.storage.path(name)
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || dirname(await realpath(path)) !== fixture.storage.root) throw new Error('Fixture import source must be an owned regular file')
  const body = createReadStream(path)
  try {
    const response = await fetch(`${fixture.endpoint}/import`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${fixture.username}:${fixture.password}`).toString('base64')}`,
        'Surreal-NS': fixture.namespace, 'Surreal-DB': fixture.database,
        'Content-Type': 'text/plain', Accept: 'application/json'
      },
      body: body as unknown as BodyInit,
      duplex: 'half'
    } as RequestInit & { duplex: 'half' })
    const text = await boundedText(response)
    const auth = Buffer.from(`${fixture.username}:${fixture.password}`).toString('base64')
    const diagnostic = text.replaceAll(auth, '[redacted]').replaceAll(fixture.username, '[redacted]').replaceAll(fixture.password, '[redacted]').replace(/[^\x20-\x7e]/g, ' ').slice(0, 400)
    if (!response.ok) throw new Error(`Fixture HTTP import failed (${response.status}): ${diagnostic}`)
    return importStatementCount(text)
  } finally { body.destroy() }
}
