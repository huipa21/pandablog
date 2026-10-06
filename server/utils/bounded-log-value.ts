/** Finite traversal before retaining/serializing best-effort log metadata.
 * Avoid getters, toJSON hooks, full Object.keys arrays and circular recursion.
 */
export function boundedLogValue(value: unknown, maxNodes = 512): unknown {
  let nodes = 0
  const seen = new WeakSet<object>()
  function visit(input: unknown, depth: number): unknown {
    if (++nodes > maxNodes || depth > 5) return '[Truncated]'
    if (typeof input === 'string') return input.slice(0, 2048)
    if (input === null || typeof input === 'boolean') return input
    if (typeof input === 'number') return Number.isFinite(input) ? input : String(input)
    if (typeof input === 'bigint') return input >= -0xffffffffffffffffn && input <= 0xffffffffffffffffn ? input.toString() : '[Truncated BigInt]'
    if (!input || typeof input !== 'object') return undefined
    if (input instanceof Date) return Number.isFinite(input.getTime()) ? input.toISOString() : null
    if (seen.has(input)) return '[Circular]'
    seen.add(input)
    if (Array.isArray(input)) {
      const result: unknown[] = []
      for (let index = 0; index < Math.min(input.length, 64) && nodes < maxNodes; index++) result.push(visit(Object.getOwnPropertyDescriptor(input, String(index))?.value, depth + 1))
      return result
    }
    const result: Record<string, unknown> = Object.create(null)
    let entries = 0
    for (const key in input) {
      if (++entries > 64 || nodes >= maxNodes) break
      const descriptor = Object.getOwnPropertyDescriptor(input, key)
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) continue
      result[key.slice(0, 128)] = visit(descriptor.value, depth + 1)
    }
    return result
  }
  return visit(value, 0)
}
