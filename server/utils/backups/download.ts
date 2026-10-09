import { createReadStream } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createError, getQuery, sendStream, setHeader, type H3Event } from 'h3'
import { BACKUP_LIMITS } from './streams'

export function rejectConsolidation(event: H3Event) {
  const query = getQuery(event)
  if ('consolidate' in query || 'consolidated' in query) throw createError({statusCode: 400, message: 'Consolidated downloads are unsupported; use a standalone full backup'})
}
/** Caller holds the bounded snapshot lease through this promise's settlement. */
export async function sendBackupFile(event: H3Event, file: string, name: string, maxBytes = BACKUP_LIMITS.compressedBytes) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error('Invalid backup attachment name')
  const directory = await lstat(dirname(file)), before = await lstat(file)
  if (!directory.isDirectory() || directory.isSymbolicLink() || !before.isFile() || before.isSymbolicLink() || before.size > maxBytes) throw new Error('Unsafe backup source')
  const handle = await open(file, 'r')
  let stream: ReturnType<typeof createReadStream> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const disconnect = () => stream?.destroy(new Error('Backup download disconnected'))
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.dev !== before.dev || info.ino !== before.ino || info.size !== before.size) throw new Error('Backup source changed while opening')
    stream = handle.createReadStream({autoClose: false})
    timer = setTimeout(() => stream?.destroy(new Error('Backup download deadline exceeded')), BACKUP_LIMITS.deadlineMs)
    event.node.res.once('close', disconnect)
    setHeader(event, 'Cache-Control', 'private, no-store')
    setHeader(event, 'Content-Type', 'application/gzip')
    setHeader(event, 'Content-Length', info.size)
    setHeader(event, 'Content-Disposition', `attachment; filename="${name}"`)
    if (event.method === 'HEAD') {event.node.res.end(); return}
    await sendStream(event, stream)
  } finally {
    if (timer) clearTimeout(timer)
    event.node.res.off('close', disconnect)
    stream?.destroy()
    await handle.close()
  }
}
