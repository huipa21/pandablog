import { createReadStream } from 'node:fs'
import { sendStream, setHeader, type H3Event } from 'h3'
import { BoundedAdmission } from '../admission'
import { BACKUP_LIMITS, regularFile } from './streams'

const readers = new BoundedAdmission({active: 8, waiting: 0, waitMs: 1}, 'Backup download')
export async function sendBackupFile(event: H3Event, file: string, name: string, maxBytes = BACKUP_LIMITS.compressedBytes) {
  const release = await readers.acquire()
  let stream: ReturnType<typeof createReadStream> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await regularFile(file, maxBytes)
    stream = createReadStream(file)
    timer = setTimeout(() => stream?.destroy(new Error('Backup download deadline exceeded')), BACKUP_LIMITS.deadlineMs)
    setHeader(event, 'Cache-Control', 'private, no-store')
    setHeader(event, 'content-type', 'application/gzip')
    setHeader(event, 'content-disposition', `attachment; filename="${name}"`)
    await sendStream(event, stream)
  } finally {
    if (timer) clearTimeout(timer)
    if (stream) {
      stream.destroy()
      if (!stream.closed) await new Promise<void>(resolve => {stream!.once('close', resolve)})
    }
    release()
  }
}
