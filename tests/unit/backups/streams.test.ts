import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { expandDump, streamToFile } from '../../../server/utils/backups/streams'
import { importSurrealDb } from '../../../server/utils/backups/surrealHttp'

async function owned(work: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'pb-stream-owned-'))
  try {await work(root)} finally {await rm(root, {recursive: true, force: true})}
}

describe('bounded backup file streams', () => {
  it('rejects expansion bombs before publication and preserves preexisting files', () => owned(async root => {
    const archive = join(root, 'bomb.gz'), target = join(root, 'stage.surql')
    await writeFile(archive, gzipSync('x'.repeat(20_000)))
    await expect(expandDump(archive, target, {maxBytes: 1024, reserveBytes: 1})).rejects.toThrow()
    await expect(access(target)).rejects.toThrow()
    await writeFile(target, 'preserve')
    await expect(streamToFile(Readable.from('new'), target, {reserveBytes: 1})).rejects.toThrow()
    expect(await readFile(target, 'utf8')).toBe('preserve')
  }))
  it('aborts stalled pipelines and closes them before stage cleanup', () => owned(async root => {
    const source = new Readable({read() {}})
    await expect(streamToFile(source, join(root, 'stalled'), {deadlineMs: 10, reserveBytes: 1})).rejects.toThrow()
    expect(source.destroyed).toBe(true)
    await expect(access(join(root, 'stalled'))).rejects.toThrow()
  }))
})

describe('actual native fetch duplex/disposal against owned synthetic HTTP only', () => {
  it.each(['[]', '', 'not-json', '[{}]', '[{"status":"ERR","result":"fixture failure"}]'])('strictly validates HTTP 200 response %s', async body => {
    let bytes = 0
    const server = createServer((request, response) => {request.on('data', chunk => {bytes += chunk.length}); request.on('end', () => {response.writeHead(200, {'content-type': 'application/json'}); response.end(body)})})
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    vi.stubGlobal('useRuntimeConfig', () => ({surrealUrl: `http://127.0.0.1:${(server.address() as {port: number}).port}/rpc`, surrealRoot: 'synthetic-only', surrealRootPassword: 'synthetic-only', surrealNamespace: 'synthetic', surrealDatabase: 'synthetic'}))
    try {
      const operation = importSurrealDb(Readable.from([Buffer.alloc(64 * 1024), Buffer.alloc(64 * 1024)]))
      if (body === '[]') expect(await operation).toMatchObject({errorCount: 0, total: 0})
      else await expect(operation).rejects.toThrow()
      expect(bytes).toBe(128 * 1024)
    } finally {vi.unstubAllGlobals(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))}
  })
  it('caller cancellation aborts slow HTTP transport and closes the source, without claiming DB rollback', async () => {
    const server = createServer(request => {request.resume()})
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    vi.stubGlobal('useRuntimeConfig', () => ({surrealUrl: `http://127.0.0.1:${(server.address() as {port: number}).port}/rpc`, surrealRoot: 'synthetic', surrealRootPassword: 'synthetic', surrealNamespace: 'synthetic', surrealDatabase: 'synthetic'}))
    const source = Readable.from('OPTION IMPORT;'), controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30)
    try {
      await expect(importSurrealDb(source, undefined, controller.signal)).rejects.toMatchObject({uncertain: true})
      expect(source.destroyed).toBe(true)
    } finally {clearTimeout(timer); vi.unstubAllGlobals(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))}
  })
})
