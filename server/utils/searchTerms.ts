import type { Surreal } from 'surrealdb'
import { queryDb } from './db'
import { queryRows, recordIdPart, stringifyRecordId } from './surrealResult'
import {
  buildFuzzyVariants,
  extractVocabularyWords,
  firstCharOf,
  fuzzyLookupWords,
  maxEditsForLength,
  rankFuzzyCandidates,
  wordLength,
  type FuzzyCandidate,
  type FuzzyVariant
} from './fuzzy'

/**
 * Fuzzy-search word list ("vocabulary") kept in SurrealDB.
 *
 *   search_term         one row per (scope, word) with a document count (df)
 *   search_term_source  the words each source record contributed, so updates
 *                       can be applied as a diff (df +1 / -1)
 *
 * Scopes:
 *   post        title + summary + current-version blocks of every non-archived
 *               post (drafts included; results are still access-filtered)
 *   post_title  titles only (related-post picker)
 *
 * Only non-current versions and archived posts are excluded. Sync failures
 * never fail the calling request; the full rebuild repairs any drift.
 */

export type SearchTermScope = 'post' | 'post_title'

export const SEARCH_TERM_SCOPES: readonly SearchTermScope[] = ['post', 'post_title']

export interface PostSearchTermInput {
  status?: unknown
  title?: unknown
  summary?: unknown
  blockTexts?: string[]
}

export interface FuzzyLookupResult {
  known: boolean
  candidates: FuzzyCandidate[]
}

const SYNC_BATCH_SIZE = 400

function toTermRows(words: string[]) {
  return words.map((term) => ({ term, first_char: firstCharOf(term), term_len: wordLength(term) }))
}

/** Words each scope should hold for a post (empty when archived). */
export function computePostSearchTerms(input: PostSearchTermInput): Record<SearchTermScope, string[]> {
  if (input.status === 'archived') {
    return { post: [], post_title: [] }
  }
  const title = typeof input.title === 'string' ? input.title : ''
  const summary = typeof input.summary === 'string' ? input.summary : ''
  const body = (input.blockTexts ?? []).join('\n')
  return {
    post: extractVocabularyWords([title, summary, body].join('\n')),
    post_title: extractVocabularyWords(title)
  }
}

function normalizePostSource(postId: string): string {
  return `post:${recordIdPart(postId, 'post')}`
}

/**
 * Update the word list for one post. Pass `data` when the caller already has
 * the post fields and current block texts; otherwise they are loaded.
 * Never throws.
 */
export async function syncPostSearchTerms(db: Surreal, postId: string, data?: PostSearchTermInput): Promise<void> {
  try {
    const source = normalizePostSource(postId)
    const input = data ?? await loadPostSearchTermInput(db, source)
    const next = input ? computePostSearchTerms(input) : { post: [], post_title: [] }
    await applySourceTerms(db, source, next)
  } catch (error) {
    console.warn('[search-terms] post sync failed', postId, error instanceof Error ? error.message : error)
  }
}

/** Remove a post's words (hard delete). Never throws. */
export async function removePostSearchTerms(db: Surreal, postId: string): Promise<void> {
  try {
    await applySourceTerms(db, normalizePostSource(postId), { post: [], post_title: [] })
  } catch (error) {
    console.warn('[search-terms] post removal failed', postId, error instanceof Error ? error.message : error)
  }
}

async function loadPostSearchTermInput(db: Surreal, source: string): Promise<PostSearchTermInput | null> {
  const id = recordIdPart(source, 'post')
  const response = await queryDb(
    db,
    `SELECT status, title, summary FROM type::record($table, $id);
     SELECT VALUE out.text FROM has_blocks WHERE in = type::record('versions', $versionId);`,
    // Current version ids are deterministic: `<postId>__current` (see blocks.ts).
    { table: 'post', id, versionId: `${id}__current` },
    { label: 'search terms load post' }
  )
  const post = queryRows<Record<string, unknown>>(response, 0)[0]
  if (!post) return null
  const blockTexts = queryRows<unknown>(response, 1).filter((text): text is string => typeof text === 'string')
  return { status: post.status, title: post.title, summary: post.summary, blockTexts }
}

async function applySourceTerms(db: Surreal, source: string, next: Record<SearchTermScope, string[]>) {
  const previousResponse = await queryDb(
    db,
    'SELECT scope, terms FROM search_term_source WHERE source = $source;',
    { source },
    { label: 'search terms load source' }
  )
  const previous = new Map<string, string[]>()
  for (const row of queryRows<{ scope?: unknown, terms?: unknown }>(previousResponse, 0)) {
    if (typeof row.scope === 'string' && Array.isArray(row.terms)) {
      previous.set(row.scope, row.terms.filter((term): term is string => typeof term === 'string'))
    }
  }

  const statements: string[] = []
  const params: Record<string, unknown> = { source }
  SEARCH_TERM_SCOPES.forEach((scope, index) => {
    const before = new Set(previous.get(scope) ?? [])
    const after = new Set(next[scope])
    const added = [...after].filter((term) => !before.has(term))
    const removed = [...before].filter((term) => !after.has(term))
    if (!added.length && !removed.length) return

    params[`scope_${index}`] = scope
    params[`added_${index}`] = toTermRows(added)
    params[`removed_${index}`] = removed
    params[`terms_${index}`] = [...after]
    statements.push(
      `FOR $t IN $added_${index} { UPSERT type::record('search_term', [$scope_${index}, $t.term]) SET scope = $scope_${index}, term = $t.term, first_char = $t.first_char, term_len = $t.term_len, df = (df ?? 0) + 1; };`,
      `FOR $t IN $removed_${index} { UPDATE type::record('search_term', [$scope_${index}, $t]) SET df = df - 1; DELETE type::record('search_term', [$scope_${index}, $t]) WHERE df <= 0; };`,
      after.size
        ? `UPSERT type::record('search_term_source', [$scope_${index}, $source]) SET scope = $scope_${index}, source = $source, terms = $terms_${index}, updated_at = time::now();`
        : `DELETE type::record('search_term_source', [$scope_${index}, $source]);`
    )
  })

  if (!statements.length) return
  await queryDb(
    db,
    ['BEGIN TRANSACTION;', ...statements, 'COMMIT TRANSACTION;'].join('\n'),
    params,
    { label: 'search terms sync', timeoutMs: 30_000 }
  )
}

/**
 * Rebuild the whole post word list from the current data (startup backfill,
 * after a backup restore). Never throws; returns false on failure.
 */
export async function rebuildPostSearchTerms(db: Surreal): Promise<boolean> {
  try {
    const response = await queryDb(
      db,
      `SELECT id, status, title, summary FROM post WHERE status != 'archived';
       SELECT (in<-has_version.in)[0] AS post_id, out.text AS text FROM has_blocks WHERE in.version = 'current';`,
      undefined,
      { label: 'search terms rebuild load', timeoutMs: 60_000 }
    )
    const blockTextsByPost = new Map<string, string[]>()
    for (const row of queryRows<{ post_id?: unknown, text?: unknown }>(response, 1)) {
      const postId = stringifyRecordId(row.post_id)
      if (!postId || typeof row.text !== 'string') continue
      const list = blockTextsByPost.get(postId) ?? []
      list.push(row.text)
      blockTextsByPost.set(postId, list)
    }

    const counts: Record<SearchTermScope, Map<string, number>> = { post: new Map(), post_title: new Map() }
    const sources: Array<{ scope: SearchTermScope, source: string, terms: string[] }> = []
    for (const post of queryRows<Record<string, unknown>>(response, 0)) {
      const source = stringifyRecordId(post.id)
      if (!source) continue
      const terms = computePostSearchTerms({
        status: post.status,
        title: post.title,
        summary: post.summary,
        blockTexts: blockTextsByPost.get(source) ?? []
      })
      for (const scope of SEARCH_TERM_SCOPES) {
        if (!terms[scope].length) continue
        sources.push({ scope, source, terms: terms[scope] })
        for (const term of terms[scope]) {
          counts[scope].set(term, (counts[scope].get(term) ?? 0) + 1)
        }
      }
    }

    await queryDb(
      db,
      'DELETE search_term WHERE scope IN $scopes; DELETE search_term_source WHERE scope IN $scopes;',
      { scopes: SEARCH_TERM_SCOPES },
      { label: 'search terms rebuild clear', timeoutMs: 60_000 }
    )

    for (const scope of SEARCH_TERM_SCOPES) {
      const rows = [...counts[scope]].map(([term, df]) => ({ ...toTermRows([term])[0], df }))
      for (let start = 0; start < rows.length; start += SYNC_BATCH_SIZE) {
        await queryDb(
          db,
          `FOR $t IN $rows { UPSERT type::record('search_term', [$scope, $t.term]) SET scope = $scope, term = $t.term, first_char = $t.first_char, term_len = $t.term_len, df = $t.df; };`,
          { scope, rows: rows.slice(start, start + SYNC_BATCH_SIZE) },
          { label: 'search terms rebuild terms', timeoutMs: 60_000 }
        )
      }
    }

    for (let start = 0; start < sources.length; start += SYNC_BATCH_SIZE) {
      await queryDb(
        db,
        `FOR $s IN $rows { UPSERT type::record('search_term_source', [$s.scope, $s.source]) SET scope = $s.scope, source = $s.source, terms = $s.terms, updated_at = time::now(); };`,
        { rows: sources.slice(start, start + SYNC_BATCH_SIZE) },
        { label: 'search terms rebuild sources', timeoutMs: 60_000 }
      )
    }
    return true
  } catch (error) {
    console.warn('[search-terms] rebuild failed', error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Look up fuzzy candidates for several words in one round trip. A word is
 * "known" when it is in the word list or is the prefix of a listed word; known
 * words are not fuzzed.
 */
export async function lookupFuzzyCandidates(db: Surreal, scope: SearchTermScope, words: string[]): Promise<Map<string, FuzzyLookupResult>> {
  const results = new Map<string, FuzzyLookupResult>()
  const lookups = words
    .map((word) => ({ word, length: wordLength(word), maxEdits: maxEditsForLength(wordLength(word)) }))
    .filter((lookup) => lookup.maxEdits > 0)
  if (!lookups.length) return results

  const statements: string[] = []
  const params: Record<string, unknown> = { scope }
  lookups.forEach((lookup, index) => {
    params[`w_${index}`] = lookup.word
    params[`f_${index}`] = firstCharOf(lookup.word)
    params[`min_${index}`] = lookup.length - lookup.maxEdits
    params[`max_${index}`] = lookup.length + lookup.maxEdits
    params[`len_${index}`] = lookup.length
    params[`e_${index}`] = lookup.maxEdits
    statements.push(
      `SELECT term, df, string::distance::damerau_levenshtein(term, $w_${index}) AS distance FROM search_term
        WHERE scope = $scope AND first_char = $f_${index} AND term_len >= $min_${index} AND term_len <= $max_${index}
          AND string::distance::damerau_levenshtein(term, $w_${index}) <= $e_${index};`,
      `SELECT VALUE term FROM search_term
        WHERE scope = $scope AND first_char = $f_${index} AND term_len > $len_${index} AND string::starts_with(term, $w_${index})
        LIMIT 1;`
    )
  })

  const response = await queryDb(db, statements.join('\n'), params, { label: 'search terms fuzzy lookup' })
  lookups.forEach((lookup, index) => {
    const rows = queryRows<{ term?: unknown, df?: unknown, distance?: unknown }>(response, index * 2)
    const prefixRows = queryRows<unknown>(response, index * 2 + 1)
    const candidates: FuzzyCandidate[] = rows
      .filter((row) => typeof row.term === 'string')
      .map((row) => ({ term: String(row.term), df: Number(row.df ?? 0), distance: Number(row.distance ?? 0) }))
    const known = prefixRows.length > 0 || candidates.some((candidate) => candidate.distance === 0 && candidate.term === lookup.word)
    results.set(lookup.word, { known, candidates: known ? [] : rankFuzzyCandidates(candidates) })
  })
  return results
}

/**
 * Fuzzy needles for several keywords at once (one DB round trip).
 * Returns a map keyed by the original keyword text.
 */
export async function expandFuzzyNeedles(db: Surreal, scope: SearchTermScope, texts: string[]): Promise<Map<string, FuzzyVariant[]>> {
  const variantsByText = new Map<string, FuzzyVariant[]>()
  const wordsByText = new Map(texts.map((text) => [text, fuzzyLookupWords(text)] as const))
  const allWords = [...new Set([...wordsByText.values()].flat())]
  if (!allWords.length) return variantsByText

  let lookup: Map<string, FuzzyLookupResult>
  try {
    lookup = await lookupFuzzyCandidates(db, scope, allWords)
  } catch (error) {
    console.warn('[search-terms] fuzzy lookup failed', error instanceof Error ? error.message : error)
    return variantsByText
  }

  for (const [text, words] of wordsByText) {
    const candidatesByWord = new Map<string, FuzzyCandidate[]>()
    for (const word of words) {
      const result = lookup.get(word)
      if (result && !result.known && result.candidates.length) {
        candidatesByWord.set(word, result.candidates)
      }
    }
    const variants = buildFuzzyVariants(text, candidatesByWord)
    if (variants.length) variantsByText.set(text, variants)
  }
  return variantsByText
}
