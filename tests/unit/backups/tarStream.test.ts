import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import * as tar from 'tar'
import { createMediaTar, extractMediaTar, collectOriginalPaths } from '../../../server/utils/backups/tarStream'

async function fixture(work: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'pb-tar-owned-'))
  try {await work(root)} finally {await rm(root, {recursive: true, force: true})}
}
function archive(name: string, type: tar.Header['type'] = 'File', content = 'image') {
  const body = Buffer.from(type === 'File' ? content : '')
  const header = new tar.Header({path: name, type, size: body.length, mode: 0o600, linkpath: type === 'SymbolicLink' || type === 'Link' ? '../../../sentinel' : undefined})
  header.encode()
  return gzipSync(Buffer.concat([header.block!, body, Buffer.alloc((512 - body.length % 512) % 512), Buffer.alloc(1024)]))
}
const valid = `2024/01/${'a'.repeat(64)}.jpg`

describe('strict media tar policy on actual tar parser/filesystem', () => {
  it('extracts a regular original and preserves its bytes', () => fixture(async root => {
    await writeFile(join(root, 'input.gz'), archive(valid))
    expect(await extractMediaTar(join(root, 'input.gz'), join(root, 'stage'))).toBe(1)
    expect(await readFile(join(root, 'stage', valid), 'utf8')).toBe('image')
  }))
  it.each(['../escape.jpg', '/2024/01/escape.jpg', 'evil.sh', `2024/13/${'a'.repeat(64)}.jpg`, `other/${'a'.repeat(64)}.jpg`, '2024\\01\\evil.jpg'])('rejects unexpected/traversal path %s (not silent filtering)', name => fixture(async root => {
    await writeFile(join(root, 'input.gz'), archive(name))
    await expect(extractMediaTar(join(root, 'input.gz'), join(root, 'stage'))).rejects.toThrow()
  }))
  it.each(['SymbolicLink', 'Link', 'CharacterDevice', 'BlockDevice', 'FIFO'] as const)('rejects %s even with a valid hash filename', type => fixture(async root => {
    await writeFile(join(root, 'input.gz'), archive(valid, type))
    await expect(extractMediaTar(join(root, 'input.gz'), join(root, 'stage'))).rejects.toThrow()
  }))
  it('bounds actual expansion and refuses corrupt gzip', () => fixture(async root => {
    await writeFile(join(root, 'input.gz'), archive(valid, 'File', 'x'.repeat(10_000)))
    await expect(extractMediaTar(join(root, 'input.gz'), join(root, 'stage'), {bytes: 4096, entries: 10})).rejects.toThrow()
    await writeFile(join(root, 'corrupt.gz'), Buffer.from('not gzip'))
    await expect(extractMediaTar(join(root, 'corrupt.gz'), join(root, 'other'))).rejects.toThrow()
  }))
  it('round-trips full/incremental/partial empty-media selections as valid empty archives', () => fixture(async root => {
    for (const kind of ['full', 'incremental', 'partial']) {
      const target = join(root, `${kind}.tar.gz`)
      await createMediaTar([], root, target)
      expect(await extractMediaTar(target, join(root, `${kind}-stage`))).toBe(0)
    }
  }))
  it('collects only a supported finite layout and refuses unknown originals', () => fixture(async root => {
    await mkdir(join(root, 'uploads/2024/01'), {recursive: true})
    await writeFile(join(root, 'uploads', valid), 'image')
    expect(await collectOriginalPaths(join(root, 'uploads'))).toEqual([valid])
    await writeFile(join(root, 'uploads/2024/01/README.md'), 'unknown')
    await expect(collectOriginalPaths(join(root, 'uploads'))).rejects.toThrow()
  }))
})
