import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { receiveBackupUpload } from '../../../server/utils/backups/upload'

const boundary = 'owned-backup-boundary'
function multipart(names: string[], oversized = false) {
  const chunks = names.map(name => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="fixture"\r\nContent-Type: application/octet-stream\r\n\r\n${name === 'manifest' && oversized ? 'x'.repeat(4 * 1024 * 1024 + 1) : name}\r\n`))
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return Object.assign(Readable.from(chunks), {headers: {'content-type': `multipart/form-data; boundary=${boundary}`}, aborted: false}) as unknown as IncomingMessage
}
async function owned(work: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'pb-upload-owned-'))
  try {await work(root)} finally {await rm(root, {recursive: true, force: true})}
}

describe('backup multipart write settlement', () => {
  it('accepts exactly one db/media/manifest with exclusive streamed output', () => owned(async root => {
    const files = await receiveBackupUpload(multipart(['db', 'media', 'manifest']), root)
    expect(await readFile(files.dbGzPath, 'utf8')).toBe('db')
    expect(await readFile(files.mediaTarGzPath, 'utf8')).toBe('media')
    expect(files.manifestBuffer?.toString()).toBe('manifest')
  }))
  it('accepts exactly one bundle part without trusting its MIME/filename', () => owned(async root => {
    const files = await receiveBackupUpload(multipart(['backup']), root)
    expect(await readFile(files.backupGzPath!, 'utf8')).toBe('backup')
    expect((await readdir(root))).toEqual(['backup.tar.gz'])
  }))
  it.each([['backup', 'backup'], ['backup', 'db'], ['db', 'backup'], ['backup', 'manifest'], ['db', 'db', 'media'], ['db', 'media', 'media'], ['db', 'media', 'manifest', 'manifest'], ['db', 'media', 'unknown']].map(names => ({names})))('rejects duplicate/excess/unknown parts $names and settles writers before cleanup', ({names}) => owned(async root => {
    await expect(receiveBackupUpload(multipart(names), root)).rejects.toMatchObject({statusCode: 400})
    await rm(root, {recursive: true})
    await new Promise(resolve => setTimeout(resolve, 10))
    await expect(readdir(root)).rejects.toThrow()
  }))
  it('rejects oversized manifests, never truncates into a different document', () => owned(async root => {
    await expect(receiveBackupUpload(multipart(['db', 'media', 'manifest'], true), root)).rejects.toMatchObject({statusCode: 413})
  }))
  it('settles an aborted/stalled upload under its ingestion deadline', () => owned(async root => {
    const input = Object.assign(new Readable({read() {}}), {headers: {'content-type': `multipart/form-data; boundary=${boundary}`}, aborted: false}) as unknown as IncomingMessage
    await expect(receiveBackupUpload(input, root, 10)).rejects.toMatchObject({statusCode: 408})
  }))
})
