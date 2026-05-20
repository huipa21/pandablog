import { createHash } from 'node:crypto'

export function mediaHashBuffer(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}
