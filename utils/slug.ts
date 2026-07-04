/**
 * Shared slug helpers used by both the Nuxt app (client/SSR) and the Nitro
 * server. Slugs preserve the original Unicode characters (e.g. CJK, accented
 * Latin) so non-English titles keep a meaningful, URL-safe slug instead of
 * collapsing to a generic fallback. Consumers percent-encode the slug when
 * building URLs; SurrealDB lookups use parameterised queries so raw Unicode is
 * safe to store and match.
 */

const DISALLOWED = /[^\p{L}\p{N}-]+/gu
const SEPARATORS = /[\s_]+/g
const EMOJI = /\p{Extended_Pictographic}/u

/**
 * Convert an arbitrary string into a URL-friendly slug while keeping Unicode
 * letters and numbers (accented Latin and CJK included). Returns an empty
 * string when the input has no usable characters (e.g. emoji/punctuation only);
 * callers decide whether that is an error or should use a fallback.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(SEPARATORS, '-')
    .replace(DISALLOWED, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)

  // slice(0, 96) may leave a trailing dash if it cut mid-separator.
  return slug.replace(/-+$/g, '')
}

/**
 * Slug for heading anchors. Behaves like {@link slugify} but always returns a
 * non-empty value so anchor ids stay stable. The editor and public renderer
 * must call this identically so table-of-contents links match heading ids.
 */
export function slugifyHeading(value: string): string {
  return slugify(value) || 'section'
}

/** True when the value contains an emoji / pictographic character. */
export function containsEmoji(value: string): boolean {
  return EMOJI.test(value)
}
