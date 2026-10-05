import { request as httpRequest, type ClientRequest, type IncomingMessage, type RequestOptions } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { checkServerIdentity } from 'node:tls'
import { isIP } from 'node:net'
import { assertHostIsPublic, type PublicResolver } from './private-ip'

export type OutboundConnector = (options: RequestOptions & { servername?: string, rejectUnauthorized?: boolean }, callback: (response: IncomingMessage) => void) => ClientRequest
export interface OutboundOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  maxBytes?: number
  maxRedirects?: number
  timeoutMs?: number
  signal?: AbortSignal
  statusOnly?: boolean
}
export interface OutboundResult { status: number, headers: IncomingMessage['headers'], body: Buffer, url: URL }
let active = 0
const MAX_ACTIVE = 4 // one writer, no waiting/body queue, no host-keyed agent map

function parseUrl(input: string): URL {
  if (typeof input !== 'string' || input.length > 4096) throw new Error('Invalid outbound URL')
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port === '0') throw new Error('Invalid outbound URL')
  return url
}
function bounded(value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error('Invalid outbound budget')
  return value
}

/** One deadline covers DNS, connect, every hop and all bytes. No hidden fetch. */
export async function safeOutboundRequest(input: string, options: OutboundOptions = {}, dependencies: { resolve?: PublicResolver, connect?: OutboundConnector } = {}): Promise<OutboundResult> {
  const timeoutMs = bounded(options.timeoutMs ?? 15_000, 1, 30_000)
  const maxBytes = bounded(options.maxBytes ?? 10 * 1024 * 1024, 1, 10 * 1024 * 1024)
  const redirects = bounded(options.maxRedirects ?? 0, 0, 3)
  if (options.body && Buffer.byteLength(options.body) > 64 * 1024) throw new Error('Outbound request body too large')
  if (active >= MAX_ACTIVE) throw new Error('Outbound capacity exceeded')
  active++ // reserve synchronously, before DNS/IO
  const controller = new AbortController()
  let req: ClientRequest | undefined
  let response: IncomingMessage | undefined
  const abort = () => controller.abort(new Error('Outbound request aborted'))
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) abort()
  const timer = setTimeout(() => controller.abort(new Error('Outbound deadline exceeded')), timeoutMs)
  const signal = controller.signal
  let rejectAbort: (() => void) | undefined
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => {
        req?.destroy(signal.reason)
        response?.destroy(signal.reason)
        reject(signal.reason)
      }
      signal.addEventListener('abort', rejectAbort, { once: true })
      if (signal.aborted) rejectAbort()
    })
    const work = async (): Promise<OutboundResult> => {
      let url = parseUrl(input)
      for (let hop = 0; ; hop++) {
        signal.throwIfAborted()
        const address = await assertHostIsPublic(url.hostname, dependencies.resolve, signal)
        signal.throwIfAborted() // a late resolver can never launch a connection
        const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
        const secure = url.protocol === 'https:'
        const connect = dependencies.connect ?? (secure ? httpsRequest : httpRequest)
        response = await new Promise<IncomingMessage>((resolve, reject) => {
          req = connect({
            protocol: url.protocol, hostname: address,
            port: Number(url.port || (secure ? 443 : 80)),
            path: `${url.pathname}${url.search}`, method: options.method ?? 'GET',
            agent: false, maxHeaderSize: 16 * 1024,
            servername: secure && !isIP(host) ? host : undefined,
            rejectUnauthorized: true,
            // Verify the ORIGINAL name even when a literal maps to another form.
            ...(secure ? { checkServerIdentity: (_name: string, cert: Parameters<typeof checkServerIdentity>[1]) => checkServerIdentity(host, cert) } : {}),
            headers: { ...options.headers, Host: url.host }
          }, (incoming) => {
            incoming.on('error', () => {}) // disposal errors cannot go unhandled
            if (signal.aborted) { incoming.destroy(); reject(signal.reason) }
            else resolve(incoming)
          })
          req.on('error', reject)
          const currentRequest = req
          currentRequest.setTimeout(Math.min(timeoutMs, 5_000), () => currentRequest.destroy(new Error('Outbound inactivity timeout')))
          currentRequest.end(options.body)
        })
        const status = response.statusCode ?? 0
        if (status >= 300 && status < 400) {
          const location = response.headers.location
          response.destroy()
          req?.destroy()
          if (!location || hop >= redirects || options.method === 'POST') throw new Error('Outbound redirect refused')
          url = parseUrl(new URL(location, url).href)
          continue
        }
        if (status < 200 || status >= 300) { response.destroy(); throw new Error(`Outbound HTTP ${status}`) }
        if (options.statusOnly) { response.destroy(); return {status, headers: response.headers, body: Buffer.alloc(0), url} }
        const declared = response.headers['content-length']
        if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new Error('Outbound response too large or invalid length')
        const chunks: Buffer[] = []
        let bytes = 0
        for await (const chunk of response) {
          signal.throwIfAborted()
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          bytes += buffer.length
          if (bytes > maxBytes) throw new Error('Outbound response too large')
          chunks.push(buffer)
        }
        signal.throwIfAborted()
        return { status, headers: response.headers, body: Buffer.concat(chunks, bytes), url }
      }
    }
    return await Promise.race([work(), deadline])
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    if (rejectAbort) signal.removeEventListener('abort', rejectAbort)
    req?.destroy()
    response?.destroy()
    active--
  }
}
