/**
 * Estimated reading time for a post.
 *
 * Latin-script words and CJK characters read at very different speeds, so the
 * two stats from `computeContentStats` are converted separately and summed.
 */
export const LATIN_WORDS_PER_MINUTE = 220
export const CJK_CHARS_PER_MINUTE = 400

export interface ReadingTimeInput {
  word_count?: number | null
  cjk_char_count?: number | null
}

/** Returns whole minutes (minimum 1), or 0 when the post has no readable text. */
export function estimateReadingMinutes(input: ReadingTimeInput | null | undefined): number {
  const words = Math.max(0, Number(input?.word_count ?? 0) || 0)
  const cjk = Math.max(0, Number(input?.cjk_char_count ?? 0) || 0)
  if (!words && !cjk) {
    return 0
  }

  const minutes = words / LATIN_WORDS_PER_MINUTE + cjk / CJK_CHARS_PER_MINUTE
  return Math.max(1, Math.ceil(minutes))
}
