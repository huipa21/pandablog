import { createHash } from 'node:crypto'

const UUID = /\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/gi
const RECORD = /\b[a-zA-Z_][\w]*:(?:⟨[^⟩]+⟩|`[^`]+`|[\w-]+)/g
const HEX = /\b(?:0x)?[\da-f]{8,}\b/gi

export function normalizeMessage(message: string): string {
  return message.replace(UUID, '<uuid>').replace(RECORD, '<rid>')
    .replace(/(["'])([^\n]*?)\1/g, (match, _quote, value: string) => value.length > 32 ? '<str>' : match)
    .replace(HEX, '<hex>').replace(/\b\d+(?:\.\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ').trim().slice(0, 300)
}

export function topAppFrame(stack: string | null): string | null {
  if (!stack) return null
  const frame = stack.split('\n').map(line => line.trim()).find(line =>
    /^(?:at\s|[^\s]+@)/.test(line) && !/node_modules|node:internal|\(native\)/.test(line))
  if (!frame) return null
  return frame.replace(/\\/g, '/').replace(/:\d+(?::\d+)?(?=\)?$)/, '')
    .replace(/(?:file:\/\/)?(?:[A-Za-z]:)?\/[^\s(]*?(?=\/\.output\/server\/|\/server\/)/, '')
}

export function normalizeRoute(path: string | null): string | null {
  if (!path) return null
  return path.split('?')[0]!.split('/').map(segment => {
    let value = segment
    try { value = decodeURIComponent(segment) } catch { /* Keep malformed paths stable. */ }
    return /^(?:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}|\d+|(?:0x)?[\da-f]{8,}|[a-zA-Z_]\w*:(?:⟨[^⟩]+⟩|`[^`]+`|[\w-]+))$/i.test(value) ? ':id' : segment
  }).join('/')
}

export function errorFingerprint(input: { name?: string; message: string; stack?: string | null; path?: string | null; status?: number | null }): string {
  const key = [input.name ?? 'Error', normalizeMessage(input.message), topAppFrame(input.stack ?? null) ?? normalizeRoute(input.path ?? null), (input.status ?? 500) >= 500 ? '5xx' : String(input.status)].join('|')
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}
