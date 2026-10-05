import { getResponseHeader, setResponseHeader, type H3Event } from 'h3'

/** Stable media URLs have mutable visibility: even public bytes are no-store.
 * Append Vary, never remove hotlink/proxy variation already established.
 */
export function privateMediaHeaders(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  appendMediaVary(event, ['Cookie'])
}

export function appendMediaVary(event: H3Event, names: readonly string[]) {
  const current = String(getResponseHeader(event, 'Vary') ?? '').split(',').map(value => value.trim()).filter(Boolean)
  for (const name of names) if (!current.some(value => value.toLowerCase() === name.toLowerCase())) current.push(name)
  setResponseHeader(event, 'Vary', current.join(', '))
}
