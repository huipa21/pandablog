/**
 * Compute reading-volume stats for a piece of text.
 *
 * Rules:
 *  - "words" counts whitespace-separated tokens that contain at least one
 *    Latin/Cyrillic/Greek letter or digit. CJK characters are NOT counted as
 *    words even if no whitespace separates them.
 *  - "cjk_chars" counts every Han / Hiragana / Katakana / Hangul code point.
 *
 * For mixed-language posts both numbers are meaningful and can be displayed
 * together (e.g. "1,240 chars · 312 words").
 */
export interface ContentStats {
  word_count: number
  cjk_char_count: number
}

const CJK_REGEX = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/gu
const WORD_TOKEN_REGEX = /[A-Za-z0-9\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]+/gu

export function computeContentStats(text: string | null | undefined): ContentStats {
  if (!text) {
    return { word_count: 0, cjk_char_count: 0 }
  }

  const cjkMatches = text.match(CJK_REGEX)
  const wordMatches = text.match(WORD_TOKEN_REGEX)

  return {
    word_count: wordMatches ? wordMatches.length : 0,
    cjk_char_count: cjkMatches ? cjkMatches.length : 0
  }
}
