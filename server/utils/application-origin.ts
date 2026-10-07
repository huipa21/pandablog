import { createError } from 'h3'

/** Canonical deployment origin is configuration, never forwarded headers. */
export function validateMutationOrigin(configured: unknown): string {
  try {
    if (typeof configured !== 'string' || !configured || configured.length > 2048) throw new Error('invalid origin')
    const url = new URL(configured)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('invalid origin')
    return url.origin
  } catch {throw createError({statusCode: 503, message: 'Canonical application origin is invalid'})}
}
