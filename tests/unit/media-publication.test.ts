import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
let root: string | undefined
let cwd: ReturnType<typeof vi.spyOn> | undefined
afterEach(async () => {cwd?.mockRestore(); if (root) await rm(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 50}); root = undefined; vi.resetModules()})
async function setup() {
  root = await mkdtemp(join(tmpdir(), 'pb-media-publication-'))
  cwd = vi.spyOn(process, 'cwd').mockReturnValue(root)
  vi.resetModules()
  return import('../../server/utils/fileStorage')
}
describe('real owned filesystem publication witnesses (not Linux power-loss)', () => {
  it('retains an exclusive inode witness for crash retirement and finishes idempotently', async () => {
    const storage = await setup(), claim = randomUUID(), path = `2020/01/${'a'.repeat(64)}.txt`, source = join(root!, 'stage')
    await writeFile(source, 'winner')
    await storage.mediaPublishStagedFile(source, path, false, claim)
    expect(await readFile(storage.mediaResolveOriginalPath(path), 'utf8')).toBe('winner')
    const objects = {original_path: path}
    await storage.mediaFinishPublication(objects, claim, true)
    await storage.mediaFinishPublication(objects, claim, true)
    expect(await readdir(join(root!, 'storage/uploads/2020/01'))).toEqual([])
  })
  it('failed exclusive publication never retires an unproven existing object', async () => {
    const storage = await setup(), path = `2020/01/${'b'.repeat(64)}.txt`, source = join(root!, 'stage'), claim = randomUUID()
    await writeFile(source, 'new'); await mkdir(join(root!, 'storage/uploads/2020/01'), {recursive: true})
    await writeFile(storage.mediaResolveOriginalPath(path), 'unknown-existing')
    await expect(storage.mediaPublishStagedFile(source, path, false, claim)).rejects.toMatchObject({code: 'EEXIST'})
    await expect(storage.mediaFinishPublication({original_path: path}, claim, true)).rejects.toThrow(/Unproven/)
    expect(await readFile(storage.mediaResolveOriginalPath(path), 'utf8')).toBe('unknown-existing')
  })
  it('ready witness cleanup preserves final bytes and deletion is idempotent', async () => {
    const storage = await setup(), path = `2020/01/${'c'.repeat(64)}.txt`, source = join(root!, 'stage'), claim = randomUUID()
    await writeFile(source, 'ready'); await storage.mediaPublishStagedFile(source, path, false, claim)
    await storage.mediaFinishPublication({original_path: path}, claim)
    await storage.mediaFinishPublication({original_path: path}, claim)
    expect(await readFile(storage.mediaResolveOriginalPath(path), 'utf8')).toBe('ready')
    await storage.mediaDeleteStoredObjects({original_path: path}); await storage.mediaDeleteStoredObjects({original_path: path})
  })
})
