import { Resolver } from 'node:dns/promises'
import { isIP } from 'node:net'

export type PublicResolver = (hostname: string, signal?: AbortSignal) => Promise<Array<{ address: string }>>

/** Conservative non-global policy, not merely RFC1918. Invalid input denies. */
export function isPrivateIp(ip: string): boolean {
  if (ip.includes('%')) return true // scoped addresses are never outbound targets
  const family = isIP(ip)
  if (family === 4) return blockedV4(ip.split('.').map(Number))
  if (family !== 6) return true
  const words = ipv6Words(ip)
  if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
    return blockedV4([words[6]! >> 8, words[6]! & 255, words[7]! >> 8, words[7]! & 255])
  }
  // Global unicast 2000::/3 only. This excludes loopback, unspecified,
  // compatible/NAT64, link-local fe80::/10, ULA fc00::/7 and multicast.
  const first = words[0]!
  if ((first & 0xe000) !== 0x2000) return true
  // Special-purpose 2001::/23, documentation, 6to4 (embedded target), 3fff::/20.
  return (first === 0x2001 && (words[1]! < 0x200 || words[1] === 0xdb8))
    || first === 0x2002 || (first === 0x3fff && words[1]! < 0x1000)
}

function blockedV4([a = -1, b = -1, c = -1]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113)
}

/** Called only after net.isIP validates the complete syntax. */
function ipv6Words(ip: string): number[] {
  let hex = ip.toLowerCase()
  if (hex.includes('.')) {
    const boundary = hex.lastIndexOf(':')
    const bytes = hex.slice(boundary + 1).split('.').map(Number)
    hex = `${hex.slice(0, boundary)}:${((bytes[0]! << 8) | bytes[1]!).toString(16)}:${((bytes[2]! << 8) | bytes[3]!).toString(16)}`
  }
  const [left = '', right] = hex.split('::')
  const prefix = left ? left.split(':').map(part => parseInt(part, 16)) : []
  if (right === undefined) return prefix
  const suffix = right ? right.split(':').map(part => parseInt(part, 16)) : []
  return [...prefix, ...Array<number>(8 - prefix.length - suffix.length).fill(0), ...suffix]
}

/** Per-operation cancellable resolver; no native lookup remains after deadline. */
export const resolvePublicAddresses: PublicResolver = async (hostname, signal) => {
  const resolver = new Resolver({ timeout: 2_000, tries: 1 })
  const abort = () => resolver.cancel()
  signal?.throwIfAborted()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const answers = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)])
    const addresses: Array<{ address: string }> = []
    for (const answer of answers) {
      if (answer.status === 'fulfilled') addresses.push(...answer.value.map(address => ({ address })))
      else if (!['ENODATA', 'ENOTFOUND'].includes(String(answer.reason?.code))) throw new Error('Could not resolve host')
    }
    signal?.throwIfAborted()
    return addresses
  } finally { signal?.removeEventListener('abort', abort) }
}

/** Every A/AAAA answer must be global; mixed answers deny the whole target. */
export async function assertHostIsPublic(hostname: string, resolve: PublicResolver = resolvePublicAddresses, signal?: AbortSignal): Promise<string> {
  const clean = hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
  if (!clean || clean.length > 253 || /(?:^|\.)(?:localhost|local|internal|home|test|invalid|onion)$/.test(clean)) throw new Error('Host is not allowed')
  if (isIP(clean)) {
    if (isPrivateIp(clean)) throw new Error('Host is not allowed')
    return clean
  }
  if (!clean.includes('.')) throw new Error('Host is not allowed')
  const addresses = await resolve(clean, signal)
  if (!addresses.length || addresses.length > 64) throw new Error('Could not resolve host')
  if (addresses.some(entry => isPrivateIp(entry.address))) throw new Error('Host resolves to a non-global address')
  return addresses[0]!.address
}
