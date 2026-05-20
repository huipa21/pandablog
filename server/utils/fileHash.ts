import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'

export function mediaHashBuffer(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function mediaHashReadableStream(stream: Readable) {
  const hash = createHash('sha256')

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}
