import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Shared SSRF guard helpers. Used to keep server-initiated outbound requests
 * (e.g. security alert webhooks) from reaching private/loopback/link-local
 * addresses, even when an admin-supplied hostname resolves to one.
 */

export function isPrivateIp(ip: string): boolean {
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

/**
 * Resolve `hostname` and throw unless every resolved address is a public IP.
 * Returns the first validated address.
 */
export async function assertHostIsPublic(hostname: string): Promise<string> {
  const cleanHostname = hostname.replace(/^\[|\]$/g, '').toLowerCase()

  if (
    !cleanHostname ||
    cleanHostname === 'localhost' ||
    cleanHostname.endsWith('.localhost') ||
    cleanHostname.endsWith('.local')
  ) {
    throw new Error('Host is not allowed')
  }

  if (isIP(cleanHostname)) {
    if (isPrivateIp(cleanHostname)) {
      throw new Error('Host is not allowed')
    }
    return cleanHostname
  }

  let addresses: Array<{ address: string }>
  try {
    addresses = await dnsLookup(cleanHostname, { all: true })
  } catch {
    throw new Error('Could not resolve host')
  }

  if (!addresses.length) {
    throw new Error('Could not resolve host')
  }

  for (const entry of addresses) {
    if (isPrivateIp(entry.address)) {
      throw new Error('Host resolves to a private address')
    }
  }

  return addresses[0]!.address
}
