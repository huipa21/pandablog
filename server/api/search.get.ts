import { queryDb, useDb } from '../utils/db'
import { queryRows, recordIdPart, stringifyRecordId } from '../utils/surrealResult'
import type { JsonContent, SearchBlockMatch, SearchPostResult, SearchResponse, SearchSort } from '~/types/content'

/**
 * Public full-text search across blocks. Groups matches by post, capping
 * `maxPerPost` matches per post (default 5), aggregating relevance scores,
 * and filtering to published + publicly visible posts only.
 */
export default defineEventHandler(async (event): Promise<SearchResponse> => {
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  const sort = normalizeSort(query.sort)
  const limit = clamp(Number(query.limit ?? 20), 1, 50)
  const maxPerPost = clamp(Number(query.maxPerPost ?? 5), 1, 20)

  if (!q) {
    return { query: '', sort, limit, total: 0, maxPerPost, results: [] }
  }

  const db = await useDb()

  // FTS the block table, walking back to owning posts via the has_blocks edge.
  const ftsResponse = await queryDb(
    db,
    `SELECT
      id,
      type,
      text,
      search::score(0) AS score,
      search::highlight('<mark>', '</mark>', 0) AS snippet,
      <-has_blocks<-post AS owners
     FROM block
     WHERE text @0@ $needle
     ORDER BY score DESC
     LIMIT 500;`,
    { needle: q }
  )
  const matches = queryRows<{
    id: unknown
    type?: unknown
    text?: unknown
    score?: unknown
    snippet?: unknown
    owners?: unknown[]
  }>(ftsResponse, 0)

  // FTS the post table directly on title (@0@) and summary (@1@). Title matches
  // must surface even when no block matches, and rank above body hits.
  const postFtsResponse = await queryDb(
    db,
    `SELECT
      id,
      title,
      summary,
      search::score(0) AS title_score,
      search::score(1) AS summary_score,
      search::highlight('<mark>', '</mark>', 0) AS title_snippet,
      search::highlight('<mark>', '</mark>', 1) AS summary_snippet
     FROM post
     WHERE status = 'published'
       AND (visibility = 'public' OR visibility IS NONE)
       AND (title @0@ $needle OR summary @1@ $needle)
     LIMIT 500;`,
    { needle: q }
  )
  const postMatches = queryRows<{
    id: unknown
    title?: unknown
    summary?: unknown
    title_score?: unknown
    summary_score?: unknown
    title_snippet?: unknown
    summary_snippet?: unknown
  }>(postFtsResponse, 0)

  if (!matches.length && !postMatches.length) {
    return { query: q, sort, limit, total: 0, maxPerPost, results: [] }
  }

  // Collect candidate post ids from BOTH block owners and direct post matches.
  const referencedPostIds = new Set<string>()
  for (const match of matches) {
    for (const owner of match.owners ?? []) {
      referencedPostIds.add(stringifyRecordId(owner))
    }
  }
  const postFtsById = new Map<string, {
    titleScore: number
    summaryScore: number
    titleSnippet: string
    summarySnippet: string
  }>()
  for (const match of postMatches) {
    const postId = stringifyRecordId(match.id)
    referencedPostIds.add(postId)
    postFtsById.set(postId, {
      titleScore: Number(match.title_score ?? 0),
      summaryScore: Number(match.summary_score ?? 0),
      titleSnippet: String(match.title_snippet ?? match.title ?? ''),
      summarySnippet: String(match.summary_snippet ?? match.summary ?? '')
    })
  }
  if (!referencedPostIds.size) {
    return { query: q, sort, limit, total: 0, maxPerPost, results: [] }
  }

  const postIdParams: Record<string, unknown> = { post_table: 'post' }
  const postIdExpressions = [...referencedPostIds].map((postId, index) => {
    postIdParams[`post_id_${index}`] = recordIdPart(postId, 'post')
    return `type::record($post_table, $post_id_${index})`
  })

  // Load only eligible posts referenced by the matches.
  const postResponse = await queryDb(
    db,
    `SELECT id, slug, title, summary, cover_image, published_at, author_username
     FROM post
     WHERE status = 'published'
       AND (visibility = 'public' OR visibility IS NONE)
       AND id IN [${postIdExpressions.join(', ')}];`,
    postIdParams
  )
  const publicPosts = queryRows<Record<string, unknown>>(postResponse, 0)
  const postById = new Map<string, Record<string, unknown>>()
  for (const post of publicPosts) {
    postById.set(stringifyRecordId(post.id), post)
  }

  // Title hits must outrank body hits; weight title/summary scores above blocks.
  const TITLE_WEIGHT = 10
  const SUMMARY_WEIGHT = 3

  // Group matches by post, cap at maxPerPost, aggregate score.
  const grouped = new Map<string, {
    post: Record<string, unknown>
    fieldMatches: SearchBlockMatch[]
    blockMatches: SearchBlockMatch[]
    totalMatches: number
    score: number
  }>()

  const ensureEntry = (postId: string) => {
    const post = postById.get(postId)
    if (!post) return null
    let entry = grouped.get(postId)
    if (!entry) {
      entry = { post, fieldMatches: [], blockMatches: [], totalMatches: 0, score: 0 }
      grouped.set(postId, entry)
    }
    return entry
  }

  // Seed entries for posts matched by title/summary, weighting them highest.
  for (const [postId, fts] of postFtsById) {
    const entry = ensureEntry(postId)
    if (!entry) continue
    entry.score += fts.titleScore * TITLE_WEIGHT + fts.summaryScore * SUMMARY_WEIGHT
    if (fts.titleScore > 0) {
      entry.totalMatches += 1
      entry.fieldMatches.push({
        blockId: `title:${postId}`,
        type: 'title',
        snippet: fts.titleSnippet,
        score: fts.titleScore * TITLE_WEIGHT
      })
    }
    if (fts.summaryScore > 0) {
      entry.totalMatches += 1
      entry.fieldMatches.push({
        blockId: `summary:${postId}`,
        type: 'summary',
        snippet: fts.summarySnippet,
        score: fts.summaryScore * SUMMARY_WEIGHT
      })
    }
  }

  for (const match of matches) {
    const blockId = stringifyRecordId(match.id)
    const matchScore = Number(match.score ?? 0)
    const snippet = String(match.snippet ?? match.text ?? '')
    const type = String(match.type ?? 'paragraph')

    for (const owner of match.owners ?? []) {
      const postId = stringifyRecordId(owner)
      const entry = ensureEntry(postId)
      if (!entry) continue
      entry.totalMatches += 1
      entry.score += matchScore
      entry.blockMatches.push({ blockId, type, snippet, score: matchScore })
    }
  }

  const results: SearchPostResult[] = Array.from(grouped.values()).map((entry) => ({
    post: {
      id: stringifyRecordId(entry.post.id),
      slug: String(entry.post.slug ?? ''),
      title: String(entry.post.title ?? ''),
      summary: entry.post.summary === undefined ? null : (entry.post.summary as string | null),
      cover_image: entry.post.cover_image === undefined ? null : (entry.post.cover_image as string | null),
      published_at: entry.post.published_at ? String(entry.post.published_at) : null,
      author_username: String(entry.post.author_username ?? 'admin')
    },
    score: entry.score,
    totalMatches: entry.totalMatches,
    // Field (title/summary) matches first so the strongest signal shows on top.
    matches: [...entry.fieldMatches, ...entry.blockMatches].slice(0, maxPerPost)
  }))

  sortResults(results, sort)
  const total = results.length
  return {
    query: q,
    sort,
    limit,
    total,
    maxPerPost,
    results: results.slice(0, limit)
  }
})

function sortResults(results: SearchPostResult[], sort: SearchSort) {
  switch (sort) {
    case 'date_desc':
      results.sort((a, b) => dateValue(b.post.published_at) - dateValue(a.post.published_at))
      break
    case 'date_asc':
      results.sort((a, b) => dateValue(a.post.published_at) - dateValue(b.post.published_at))
      break
    case 'title':
      results.sort((a, b) => a.post.title.localeCompare(b.post.title))
      break
    case 'relevance':
    default:
      results.sort((a, b) => b.score - a.score)
      break
  }
}

function dateValue(value: string | null | undefined): number {
  if (!value) return 0
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : 0
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function normalizeSort(value: unknown): SearchSort {
  if (value === 'date_desc' || value === 'date_asc' || value === 'title' || value === 'relevance') {
    return value
  }
  return 'relevance'
}

// Keep type import referenced for downstream consumers.
type _Unused = JsonContent
