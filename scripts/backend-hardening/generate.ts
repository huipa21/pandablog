import { open, unlink } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { OwnedStorage } from './fixture'

export interface SeedOptions {
  rows: number
  payloadBytes?: number
  chunkBytes?: number
  maxBytes?: number
  signal?: AbortSignal
}

/** Only an in-memory owned-storage capability, never a user supplied output path. */
export async function writeSqlFixture(storage: OwnedStorage, name: string, options: SeedOptions) {
  const { rows, payloadBytes = 128, chunkBytes = 64 * 1024, maxBytes = 128 * 1024 * 1024, signal } = options
  for (const [value, min, max] of [[rows, 0, 10_000_000], [payloadBytes, 0, 64 * 1024], [chunkBytes, 1, 1024 * 1024], [maxBytes, 1, 16 * 1024 ** 3]]) {
    if (!Number.isSafeInteger(value) || value! < min! || value! > max!) throw new Error('Invalid fixture seed budget')
  }
  await storage.verify()
  if (name === '.owner') throw new Error('Cannot overwrite fixture ownership receipt')
  const path = storage.path(name)
  const stats = { rows: 0, bytes: 0, maxChunkBytes: 0 }
  let created = false
  try {
    const handle = await open(path, 'wx', 0o600)
    created = true
    const output = handle.createWriteStream()
    async function* chunks() {
      // SurrealDB 3.2 /import rejects ordinary SQL without this prologue.
      let pending = 'OPTION IMPORT;\n'
      stats.bytes = pending.length
      if (stats.bytes > maxBytes) throw new Error('Fixture seed byte budget exceeded')
      while (pending.length >= chunkBytes) {
        stats.maxChunkBytes = Math.max(stats.maxChunkBytes, chunkBytes)
        yield pending.slice(0, chunkBytes)
        pending = pending.slice(chunkBytes)
      }
      const payload = 'x'.repeat(payloadBytes)
      for (let index = 0; index < rows; index++) {
        signal?.throwIfAborted()
        const row = `CREATE fixture_seed:r${index} CONTENT { ordinal: ${index}, payload: '${payload}' };\n`
        if (stats.bytes + row.length > maxBytes) throw new Error('Fixture seed byte budget exceeded')
        stats.bytes += row.length // Generated SQL is ASCII, so characters == encoded bytes.
        pending += row
        while (pending.length >= chunkBytes) {
          stats.maxChunkBytes = Math.max(stats.maxChunkBytes, chunkBytes)
          yield pending.slice(0, chunkBytes)
          pending = pending.slice(chunkBytes)
        }
        stats.rows++
      }
      if (pending) { stats.maxChunkBytes = Math.max(stats.maxChunkBytes, pending.length); yield pending }
    }
    await pipeline(Readable.from(chunks()), output, { signal })
    return stats
  } catch (error) {
    if (created) await unlink(path)
    throw new Error('Fixture seed failed before operation under test (not a workload/retention result)', { cause: error })
  }
}
