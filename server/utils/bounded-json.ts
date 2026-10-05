import { createError, getRequestHeader, setResponseHeader, type H3Event } from 'h3'

/** Byte cap before JSON parsing/allocation; oversized chunked requests stop
 * ingestion and close after the bounded error response, not an unbounded drain.
 */
export async function readBoundedJson(event: H3Event, maxBytes = 16 * 1024): Promise<Record<string, unknown>> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024) throw new Error('Invalid JSON byte budget')
  const type = (getRequestHeader(event, 'content-type') ?? '').split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') throw createError({statusCode: 415, message: 'JSON body required'})
  const length = getRequestHeader(event, 'content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    setResponseHeader(event, 'Connection', 'close')
    throw createError({statusCode: 413, message: 'Request body too large'})
  }
  const body = await new Promise<Buffer>((resolve, reject) => {
    let bytes = 0
    const chunks: Buffer[] = []
    const timer = setTimeout(() => {event.node.req.pause(); setResponseHeader(event, 'Connection', 'close'); fail(createError({statusCode: 408, message: 'Request body timeout'}))}, 10_000)
    const cleanup = () => {clearTimeout(timer); event.node.req.removeListener('data', data); event.node.req.removeListener('end', end); event.node.req.removeListener('error', error); event.node.req.removeListener('aborted', aborted)}
    const fail = (failure: Error) => {cleanup(); event.node.req.once('error', () => {}); reject(failure)}
    const error = () => fail(createError({statusCode: 400, message: 'Request body unavailable'}))
    const aborted = () => fail(createError({statusCode: 400, message: 'Request aborted'}))
    const data = (input: Buffer | string) => {
      const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input)
      bytes += chunk.length
      if (bytes > maxBytes) {
        event.node.req.pause()
        setResponseHeader(event, 'Connection', 'close')
        fail(createError({statusCode: 413, message: 'Request body too large'}))
      } else chunks.push(chunk)
    }
    const end = () => {cleanup(); resolve(Buffer.concat(chunks, bytes))}
    if (event.node.req.aborted) {aborted(); return}
    event.node.req.on('data', data); event.node.req.once('end', end); event.node.req.once('error', error); event.node.req.once('aborted', aborted)
  })
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return parsed as Record<string, unknown>
  } catch {throw createError({statusCode: 400, message: 'Invalid JSON body'})}
}
