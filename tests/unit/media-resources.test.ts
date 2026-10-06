import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { MediaUploadBudget, mediaRecoverStageDirectories, receiveMediaUpload } from '../../server/utils/media-upload'
import { mediaProcessImageFile } from '../../server/utils/imageProcessor'
import { imageAdmission } from '../../server/utils/image-work'

sharp.concurrency(1)
sharp.cache(false)
const owned: string[] = []
afterEach(async () => { for (const root of owned.splice(0)) await rm(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 50}) })
async function root() { const path = await mkdtemp(join(tmpdir(), 'pb-media-unit-')); owned.push(path); return path }
function request(body: string) {
  const stream = Readable.from(Array.from(Buffer.from(body), byte => Buffer.from([byte]))) as IncomingMessage
  stream.headers = {'content-type': 'multipart/form-data; boundary=fixture'}
  return stream
}
function part(data: string, name = 'files', filename = 'a.txt') { return `--fixture\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n${data}\r\n` }
const end = '--fixture--\r\n'
const limits = {fileBytes: 64, requestBytes: 1024, files: 2, deadlineMs: 1000, reserveBytes: 0}
describe('owned streaming media ingestion', () => {
  it('hashes chunked files incrementally and closes writers before returning', async () => {
    const path = await root(), budget = new MediaUploadBudget(1, 128)
    const upload = await receiveMediaUpload(request(part('hello') + end), {...limits, root: path, budget})
    expect(upload.files[0]!.hash).toBe(createHash('sha256').update('hello').digest('hex'))
    expect(await readFile(upload.files[0]!.path, 'utf8')).toBe('hello')
    expect(budget.diagnostics()).toMatchObject({active: 1, bytes: 5})
    await mediaRecoverStageDirectories(path) // restart simulation, before admission
    await upload.dispose(); await upload.dispose()
    expect(await readdir(path)).toEqual([])
    expect(budget.diagnostics()).toMatchObject({active: 0, bytes: 0})
  })
  it.each([
    part('x'.repeat(65)) + end,
    part('a') + part('b') + part('c') + end,
    '--fixture\r\nContent-Disposition: form-data; name="visibility"\r\n\r\n' + 'x'.repeat(1025) + '\r\n' + end,
    part('a') + '--fixture\r\nContent-Disposition: form-data; name="unknown"\r\n\r\nx\r\n' + end
  ])('rejects file/part/field limits without orphaned files', async body => {
    const path = await root(), budget = new MediaUploadBudget(1, 128)
    await expect(receiveMediaUpload(request(body), {...limits, root: path, budget})).rejects.toThrow()
    expect(await readdir(path)).toEqual([])
    expect(budget.diagnostics()).toMatchObject({active: 0, bytes: 0})
  })
  it('counts total multipart bytes and preserves unowned stage directories', async () => {
    const path = await root(), budget = new MediaUploadBudget(1, 128)
    await expect(receiveMediaUpload(request(part('x'.repeat(32)) + part('y'.repeat(32)) + end), {...limits, requestBytes: 200, root: path, budget})).rejects.toThrow(/request exceeds/)
    expect(await readdir(path)).toEqual([])
    await mkdir(join(path, 'operator-owned'))
    await writeFile(join(path, 'operator-owned', 'keep'), 'preserve')
    await expect(mediaRecoverStageDirectories(path)).rejects.toThrow(/Unrecognized/)
    expect(await readFile(join(path, 'operator-owned', 'keep'), 'utf8')).toBe('preserve')
  })
  it('settles an aborted in-flight file before deleting its stage', async () => {
    const path = await root(), budget = new MediaUploadBudget(1, 128)
    const req = new Readable({read() {}}) as IncomingMessage
    req.headers = {'content-type': 'multipart/form-data; boundary=fixture'}
    const receiving = receiveMediaUpload(req, {...limits, root: path, budget})
    req.push(part('partial').slice(0, -2))
    const timer = setTimeout(() => req.emit('aborted'), 20)
    await expect(receiving).rejects.toThrow(/aborted/)
    clearTimeout(timer); req.destroy()
    expect(await readdir(path)).toEqual([])
    expect(budget.diagnostics()).toMatchObject({active: 0, bytes: 0})
  })
  it('accepts exact per-file bytes and the optional visibility part at the part boundary', async () => {
    const path = await root(), budget = new MediaUploadBudget(1, 128)
    const field = '--fixture\r\nContent-Disposition: form-data; name="visibility"\r\n\r\nprivate\r\n'
    const upload = await receiveMediaUpload(request(part('x'.repeat(64)) + field + end), {...limits, files: 1, root: path, budget})
    expect(upload.visibility).toBe('private'); expect(upload.files[0]!.size).toBe(64)
    await upload.dispose()
    expect(budget.diagnostics()).toMatchObject({active: 0, bytes: 0})
  })
  it('refuses admission and disk bytes atomically', () => {
    const budget = new MediaUploadBudget(1, 5), lease = budget.acquire()
    expect(() => budget.acquire()).toThrow()
    lease.add(5); expect(() => lease.add(1)).toThrow()
    lease.release(); expect(budget.diagnostics()).toMatchObject({active: 0, bytes: 0})
  })
  it('times out a stalled stream and releases ownership', async () => {
    const path = await root(), budget = new MediaUploadBudget(1, 128)
    const req = new Readable({read() {}}) as IncomingMessage
    req.headers = {'content-type': 'multipart/form-data; boundary=fixture'}
    await expect(receiveMediaUpload(req, {...limits, root: path, budget, deadlineMs: 20})).rejects.toThrow(/deadline/)
    expect(await readdir(path)).toEqual([])
    expect(budget.diagnostics().active).toBe(0)
    req.destroy()
  })
})
describe('file-based admitted native images', () => {
  it('writes compatible WebP profiles under an owned stage', async () => {
    const path = await root(), file = join(path, 'original.png')
    await sharp({create: {width: 800, height: 600, channels: 3, background: 'red'}}).png().toFile(file)
    const image = await mediaProcessImageFile(file, 'a'.repeat(64), 'image/png', true, new Date('2020-01-01'), path)
    expect(image.image_meta).toMatchObject({width: 800, height: 600})
    expect(image.perceptual_hash).toHaveLength(64)
    expect(image.variants?.thumbnail).toMatchObject({width: 360, height: 360})
    expect(image.variants?.medium).toMatchObject({width: 800, height: 600})
    expect((await sharp(join(path, 'thumbnail.webp')).metadata()).format).toBe('webp')
    expect(imageAdmission.diagnostics().active).toBe(0)
  })
  it('caps real native concurrency/waiters without releasing work early', async () => {
    const path = await root(), input = join(path, 'native.png')
    await sharp({create: {width: 2000, height: 1500, channels: 3, background: 'blue'}}).png().toFile(input)
    const before = process.memoryUsage()
    let peakRss = before.rss
    const timer = setInterval(() => {peakRss = Math.max(peakRss, process.memoryUsage().rss)}, 2)
    let outcomes
    try {
      outcomes = await Promise.allSettled(Array.from({length: 6}, (_, index) => mediaProcessImageFile(input, String(index).repeat(64), 'image/png', true, new Date(), join(path, `job-${index}`))))
    } finally {clearInterval(timer)}
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(5)
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(imageAdmission.diagnostics()).toMatchObject({active: 0, waiting: 0, highActive: 1, highWaiting: 4})
    process.stdout.write(JSON.stringify({evidence: 'REV-3.1-native-driver-not-Nitro-or-constrained-production', node: process.version, before, sampledPeakRss: peakRss, after: process.memoryUsage(), queue: imageAdmission.diagnostics()}) + '\n')
  }, 15_000)
  it('rejects compressed pixel bombs and declared decoder mismatch', async () => {
    const path = await root(), file = join(path, 'original.svg')
    await writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="10000"><rect width="10000" height="10000"/></svg>')
    await expect(mediaProcessImageFile(file, 'b'.repeat(64), 'image/svg+xml', false, new Date(), path)).rejects.toThrow()
    await sharp({create: {width: 10, height: 10, channels: 3, background: 'red'}}).png().toFile(join(path, 'small'))
    await expect(mediaProcessImageFile(join(path, 'small'), 'b'.repeat(64), 'image/jpeg', false, new Date(), path)).rejects.toThrow(/type/)
    expect(imageAdmission.diagnostics().active).toBe(0)
  })
})
