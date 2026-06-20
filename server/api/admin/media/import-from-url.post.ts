import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { requireContentManager } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { mediaCreateOrReuseFileRecord } from '../../../utils/mediaLibrary'
import { getMediaSettings } from '../../../utils/settings'
import type { MediaRecord } from '~/types/content'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 15_000

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif'
}

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)
  const body = await readBody<{ url?: string }>(event)
  const rawUrl = typeof body?.url === 'string' ? body.url.trim() : ''

  if (!rawUrl) {
    throw createError({ statusCode: 400, message: 'URL is required' })
  }

  const downloaded = await fetchSafeImage(rawUrl)

  if (!downloaded.mimeType.startsWith('image/')) {
    throw createError({ statusCode: 400, message: 'URL does not point to an image' })
  }

  // SVG is an active content type (can carry scripts); never import it.
  if (downloaded.mimeType === 'image/svg+xml' || downloaded.mimeType === 'image/svg') {
    throw createError({ statusCode: 400, message: 'SVG images cannot be imported' })
  }

  const settings = await getMediaSettings()
  const db = await useDb()
  const result = await mediaCreateOrReuseFileRecord(db, {
    originalName: downloaded.filename,
    data: downloaded.buffer,
    mimeType: downloaded.mimeType,
    uploadedBy: user.username,
    createdBy: user.id,
    visibility: 'public'
  }, settings)

  const record = result.record ?? result.similar_to

  if (!record) {
    throw createError({ statusCode: 400, message: result.reason || 'Could not import file' })
  }

  return record as MediaRecord
})

async function fetchSafeImage(rawUrl: string): Promise<{ buffer: Buffer, mimeType: string, filename: string }> {
  let currentUrl = rawUrl

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = parseAndValidateUrl(currentUrl)
    // Pin the connection to the exact IP we just validated. A second DNS lookup
    // (which plain `fetch` would perform) could be rebound to a private address
    // between the check and the connect; pinning closes that TOCTOU window.
    const pinnedIp = await assertHostIsPublic(parsed.hostname)

    let response: IncomingMessage
    try {
      response = await requestImage(parsed, pinnedIp)
    } catch {
      throw createError({ statusCode: 400, message: 'Could not fetch URL' })
    }

    const status = response.statusCode ?? 0

    if (status >= 300 && status < 400) {
      const location = response.headers.location
      response.resume()
      if (!location) {
        throw createError({ statusCode: 400, message: 'Redirect without location header' })
      }
      currentUrl = new URL(location, parsed.href).href
      continue
    }

    if (status < 200 || status >= 300) {
      response.resume()
      throw createError({ statusCode: 400, message: `Could not fetch URL (status ${status})` })
    }

    const contentLength = Number(response.headers['content-length'] ?? 0)
    if (contentLength && contentLength > MAX_BYTES) {
      response.destroy()
      throw createError({ statusCode: 400, message: 'File is larger than 10 MB' })
    }

    const chunks: Buffer[] = []
    let total = 0

    try {
      for await (const chunk of response) {
        const buf = chunk as Buffer
        total += buf.byteLength
        if (total > MAX_BYTES) {
          response.destroy()
          throw createError({ statusCode: 400, message: 'File is larger than 10 MB' })
        }
        chunks.push(buf)
      }
    } catch (error) {
      if (isApiError(error)) throw error
      throw createError({ statusCode: 400, message: 'Could not read response body' })
    }

    const buffer = Buffer.concat(chunks)
    const contentTypeHeader = String(response.headers['content-type'] ?? '')
    const mimeType = (contentTypeHeader.split(';')[0] ?? '').trim().toLowerCase()
    const filename = filenameFromUrl(parsed, mimeType)
    return { buffer, mimeType, filename }
  }

  throw createError({ statusCode: 400, message: 'Too many redirects' })
}

/**
 * Issue a single GET to the already-validated IP while preserving the original
 * Host header and TLS SNI, so virtual hosting and certificate checks still work.
 */
function requestImage(parsed: URL, ip: string): Promise<IncomingMessage> {
  const isHttps = parsed.protocol === 'https:'
  const requestFn = isHttps ? httpsRequest : httpRequest
  const port = parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80)
  const cleanHost = parsed.hostname.replace(/^\[|\]$/g, '')
  const hostIsIp = isIP(cleanHost) !== 0

  return new Promise<IncomingMessage>((resolve, reject) => {
    const req = requestFn({
      host: ip,
      port,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'GET',
      servername: isHttps && !hostIsIp ? cleanHost : undefined,
      headers: {
        Host: parsed.host,
        'User-Agent': 'pandablog-image-import/1.0',
        Accept: 'image/*'
      }
    }, resolve)

    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy(new Error('Request timed out'))
    })
    req.on('error', reject)
    req.end()
  })
}

function isApiError(error: unknown): error is { statusCode: number } {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error)
}

function parseAndValidateUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid URL' })
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw createError({ statusCode: 400, message: 'URL must use http or https' })
  }

  return parsed
}

async function assertHostIsPublic(hostname: string): Promise<string> {
  const cleanHostname = hostname.replace(/^\[|\]$/g, '').toLowerCase()

  if (
    !cleanHostname ||
    cleanHostname === 'localhost' ||
    cleanHostname.endsWith('.localhost') ||
    cleanHostname.endsWith('.local')
  ) {
    throw createError({ statusCode: 400, message: 'URL host is not allowed' })
  }

  if (isIP(cleanHostname)) {
    if (isPrivateIp(cleanHostname)) {
      throw createError({ statusCode: 400, message: 'URL host is not allowed' })
    }
    return cleanHostname
  }

  let addresses: Array<{ address: string }>
  try {
    addresses = await dnsLookup(cleanHostname, { all: true })
  } catch {
    throw createError({ statusCode: 400, message: 'Could not resolve URL host' })
  }

  if (!addresses.length) {
    throw createError({ statusCode: 400, message: 'Could not resolve URL host' })
  }

  for (const entry of addresses) {
    if (isPrivateIp(entry.address)) {
      throw createError({ statusCode: 400, message: 'URL host resolves to a private address' })
    }
  }

  // Return the first validated address so the caller connects to exactly this IP.
  return addresses[0]!.address
}

function isPrivateIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return isPrivateIPv4(ip)
  if (family === 6) return isPrivateIPv6(ip)
  return true
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true

  const a = parts[0] ?? -1
  const b = parts[1] ?? -1
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a >= 224) return true
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice('::ffff:'.length)
    if (isIP(mapped) === 4) return isPrivateIPv4(mapped)
  }
  return false
}

function filenameFromUrl(url: URL, mimeType: string): string {
  const segment = url.pathname.split('/').filter(Boolean).pop() ?? ''
  let candidate = ''

  try {
    candidate = decodeURIComponent(segment)
  } catch {
    candidate = segment
  }

  candidate = (candidate.split('?')[0] ?? '').split('#')[0]?.trim() ?? ''
  if (!candidate) candidate = 'image'

  const hasExt = /\.[A-Za-z0-9]{1,5}$/.test(candidate)
  if (!hasExt) {
    const ext = EXT_BY_MIME[mimeType]
    if (ext) candidate = `${candidate}.${ext}`
  }

  return candidate
}
