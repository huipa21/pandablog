import { lookup as dnsLookup } from 'node:dns/promises'
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
  'image/avif': 'avif',
  'image/svg+xml': 'svg'
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
    await assertHostIsPublic(parsed.hostname)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Response

    try {
      response = await fetch(parsed.href, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'pandablog-image-import/1.0',
          'Accept': 'image/*'
        }
      })
    } catch {
      throw createError({ statusCode: 400, message: 'Could not fetch URL' })
    } finally {
      clearTimeout(timeoutId)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        throw createError({ statusCode: 400, message: 'Redirect without location header' })
      }
      currentUrl = new URL(location, parsed.href).href
      continue
    }

    if (!response.ok) {
      throw createError({ statusCode: 400, message: `Could not fetch URL (status ${response.status})` })
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength && contentLength > MAX_BYTES) {
      throw createError({ statusCode: 400, message: 'File is larger than 10 MB' })
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw createError({ statusCode: 400, message: 'Empty response body' })
    }

    const chunks: Uint8Array[] = []
    let total = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      total += value.byteLength
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw createError({ statusCode: 400, message: 'File is larger than 10 MB' })
      }
      chunks.push(value)
    }

    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    const contentTypeHeader = response.headers.get('content-type') ?? ''
    const mimeType = (contentTypeHeader.split(';')[0] ?? '').trim().toLowerCase()
    const filename = filenameFromUrl(parsed, mimeType)
    return { buffer, mimeType, filename }
  }

  throw createError({ statusCode: 400, message: 'Too many redirects' })
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

async function assertHostIsPublic(hostname: string): Promise<void> {
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
    return
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
