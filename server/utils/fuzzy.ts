/**
 * Pure typo-tolerance helpers shared by post, related-post and media search.
 *
 * Measure: optimal-string-alignment Damerau-Levenshtein distance (insert,
 * delete, substitute, swap two adjacent letters = 1 edit each). The allowed
 * number of edits grows with the word length, the first letter must match,
 * and only Latin / Greek / Cyrillic words take part. CJK (and Hangul) text is
 * never fuzzed; it keeps the exact ngram full-text behaviour.
 *
 * No `~` imports so unit tests can load this file directly.
 */

/** Words shorter than this are never fuzzed (too many neighbours). */
export const FUZZY_MIN_WORD_LENGTH = 4
/** Longer runs are usually hashes / identifiers, not words. */
export const FUZZY_MAX_WORD_LENGTH = 30
/** Candidates kept per misspelled word. */
export const FUZZY_MAX_CANDIDATES_PER_WORD = 3
/** Rewritten needles kept per keyword. */
export const FUZZY_MAX_VARIANTS_PER_TERM = 3
/**
 * `blog_analyzer` indexes ngrams up to 15 characters, and the query side is not
 * ngram-ed, so a query token longer than 15 characters can never match.
 * Needles are clamped to their first 15 characters (a prefix is always indexed).
 */
export const FTS_MAX_TOKEN_LENGTH = 15

const FUZZY_WORD_REGEX = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}][\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{M}]*/gu
const CLAMP_TOKEN_REGEX = /[\p{L}\p{M}]+|\p{N}+/gu

export interface FuzzyCandidate {
  term: string
  distance: number
  /** Number of documents containing the term (popularity tie-breaker). */
  df: number
}

export interface FuzzyVariant {
  /** Rewritten needle text. */
  text: string
  /** Sum of edit distances of all replaced words. */
  distance: number
}

/** Allowed edits for a word of the given length: 1-3 → 0, 4-7 → 1, 8+ → 2. */
export function maxEditsForLength(length: number): number {
  if (length < FUZZY_MIN_WORD_LENGTH) return 0
  if (length < 8) return 1
  return 2
}

/** Score multiplier applied to fuzzy hits (they always rank below exact tiers anyway). */
export function fuzzyPenalty(distance: number): number {
  if (distance <= 0) return 1
  if (distance === 1) return 0.4
  return 0.15
}

export function normalizeFuzzyWord(word: string): string {
  return word.normalize('NFC').toLowerCase()
}

export function isFuzzyEligibleWord(word: string): boolean {
  const length = [...word].length
  return length >= FUZZY_MIN_WORD_LENGTH && length <= FUZZY_MAX_WORD_LENGTH
}

/** All Latin/Greek/Cyrillic words (lowercased, in order, with duplicates). */
export function tokenizeFuzzyWords(text: string): string[] {
  return (String(text ?? '').normalize('NFC').match(FUZZY_WORD_REGEX) ?? []).map(normalizeFuzzyWord)
}

/** Distinct vocabulary words of a text that can take part in fuzzy matching. */
export function extractVocabularyWords(text: string): string[] {
  const words = new Set<string>()
  for (const word of tokenizeFuzzyWords(text)) {
    if (isFuzzyEligibleWord(word)) words.add(word)
  }
  return [...words]
}

export function firstCharOf(word: string): string {
  return [...word][0] ?? ''
}

export function wordLength(word: string): number {
  return [...word].length
}

/**
 * Optimal string alignment distance (restricted Damerau-Levenshtein).
 * Returns `max + 1` as soon as the distance is known to exceed `max`.
 */
export function damerauLevenshtein(left: string, right: string, max = Number.POSITIVE_INFINITY): number {
  const a = [...left]
  const b = [...right]
  if (Math.abs(a.length - b.length) > max) return max + 1
  if (!a.length) return b.length
  if (!b.length) return a.length

  let previousPrevious: number[] = []
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let rowMin = current[0]!
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, previousPrevious[j - 2]! + 1)
      }
      current.push(value)
      if (value < rowMin) rowMin = value
    }
    if (rowMin > max) return max + 1
    previousPrevious = previous
    previous = current
  }
  return previous[b.length]!
}

/** Sort candidates (closest first, then most common, then alphabetical) and keep the top K. */
export function rankFuzzyCandidates(candidates: FuzzyCandidate[], limit = FUZZY_MAX_CANDIDATES_PER_WORD): FuzzyCandidate[] {
  return [...candidates]
    .filter((candidate) => candidate.distance > 0)
    .sort((a, b) => a.distance - b.distance || b.df - a.df || a.term.localeCompare(b.term))
    .slice(0, limit)
}

/**
 * In-memory candidate search over a vocabulary (used by media search, where
 * all records are already loaded). Mirrors the SurrealDB lookup rules.
 */
export function findFuzzyCandidates(word: string, vocabulary: Map<string, number>): { known: boolean, candidates: FuzzyCandidate[] } {
  const normalized = normalizeFuzzyWord(word)
  const length = wordLength(normalized)
  const maxEdits = maxEditsForLength(length)
  if (vocabulary.has(normalized)) return { known: true, candidates: [] }
  if (!maxEdits || !isFuzzyEligibleWord(normalized)) return { known: false, candidates: [] }

  const first = firstCharOf(normalized)
  const candidates: FuzzyCandidate[] = []
  for (const [term, df] of vocabulary) {
    if (firstCharOf(term) !== first) continue
    const termLength = wordLength(term)
    if (termLength > length && term.startsWith(normalized)) return { known: true, candidates: [] }
    if (Math.abs(termLength - length) > maxEdits) continue
    const distance = damerauLevenshtein(normalized, term, maxEdits)
    if (distance <= maxEdits) candidates.push({ term, distance, df })
  }
  return { known: false, candidates: rankFuzzyCandidates(candidates) }
}

/** Words of a keyword that should be looked up for fuzzy candidates. */
export function fuzzyLookupWords(text: string): string[] {
  const words = new Set<string>()
  for (const word of tokenizeFuzzyWords(text)) {
    if (isFuzzyEligibleWord(word) && maxEditsForLength(wordLength(word)) > 0) words.add(word)
  }
  return [...words]
}

/**
 * Build rewritten needles by replacing misspelled words with their candidates.
 * Combinations are ordered by total distance and capped.
 */
export function buildFuzzyVariants(
  text: string,
  candidatesByWord: Map<string, FuzzyCandidate[]>,
  limit = FUZZY_MAX_VARIANTS_PER_TERM
): FuzzyVariant[] {
  const words = [...new Set(tokenizeFuzzyWords(text))].filter((word) => (candidatesByWord.get(word)?.length ?? 0) > 0)
  if (!words.length) return []

  // Breadth-limited expansion: keep the best `limit * 4` partial combinations.
  let combos: Array<{ replacements: Map<string, string>, distance: number }> = [{ replacements: new Map(), distance: 0 }]
  for (const word of words) {
    const next: typeof combos = []
    for (const combo of combos) {
      for (const candidate of candidatesByWord.get(word) ?? []) {
        const replacements = new Map(combo.replacements)
        replacements.set(word, candidate.term)
        next.push({ replacements, distance: combo.distance + candidate.distance })
      }
    }
    combos = next.sort((a, b) => a.distance - b.distance).slice(0, limit * 4)
  }

  const variants: FuzzyVariant[] = []
  const seen = new Set<string>()
  for (const combo of combos.sort((a, b) => a.distance - b.distance)) {
    const rewritten = String(text).normalize('NFC').replace(FUZZY_WORD_REGEX, (match) => combo.replacements.get(normalizeFuzzyWord(match)) ?? match)
    const key = rewritten.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    variants.push({ text: rewritten, distance: combo.distance })
    if (variants.length >= limit) break
  }
  return variants
}

/** Clamp every letter/number run to the analyzer's max ngram length. */
export function clampFtsNeedle(text: string): string {
  return String(text ?? '').replace(CLAMP_TOKEN_REGEX, (token) => {
    const chars = [...token]
    return chars.length > FTS_MAX_TOKEN_LENGTH ? chars.slice(0, FTS_MAX_TOKEN_LENGTH).join('') : token
  })
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Phrase check for multi-word keywords: the words must appear in order,
 * separated only by whitespace / punctuation. Each word may be part of a longer
 * word (same substring semantics as the ngram index).
 */
export function createPhraseMatcher(phrase: string): (text: string) => boolean {
  const words = String(phrase ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return () => true
  const pattern = words.map(escapeRegex).join('[\\s\\p{P}\\p{S}]+')
  const regex = new RegExp(pattern, 'iu')
  return (text: string) => regex.test(String(text ?? '').normalize('NFC'))
}
