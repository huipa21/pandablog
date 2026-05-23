import { queryDb, useDb } from '../utils/db'
import { queryRows, stringifyRecordId } from '../utils/surrealResult'
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

  if (!matches.length) {
    return { query: q, sort, limit, total: 0, maxPerPost, results: [] }
  }

  // Collect referenced post ids.
  const referencedPostIds = new Set<string>()
  for (const match of matches) {
    for (const owner of match.owners ?? []) {
      referencedPostIds.add(stringifyRecordId(owner))
    }
  }
  if (!referencedPostIds.size) {
    return { query: q, sort, limit, total: 0, maxPerPost, results: [] }
  }

  // Load all eligible (published + public) posts, then filter by referenced ids.
  const postResponse = await queryDb(
    db,
    `SELECT id, slug, title, summary, cover_image, published_at, author_username
     FROM post
     WHERE status = 'published'
       AND (visibility = 'public' OR visibility IS NONE);`
  )
  const allPublicPosts = queryRows<Record<string, unknown>>(postResponse, 0)
  const postById = new Map<string, Record<string, unknown>>()
  for (const post of allPublicPosts) {
    const id = stringifyRecordId(post.id)
    if (referencedPostIds.has(id)) {
      postById.set(id, post)
    }
  }

  // Group block matches by post, cap at maxPerPost, aggregate score.
  const grouped = new Map<string, {
    post: Record<string, unknown>
    matches: SearchBlockMatch[]
    totalMatches: number
    score: number
  }>()

  for (const match of matches) {
    const blockId = stringifyRecordId(match.id)
    const matchScore = Number(match.score ?? 0)
    const snippet = String(match.snippet ?? match.text ?? '')
    const type = String(match.type ?? 'paragraph')

    for (const owner of match.owners ?? []) {
      const postId = stringifyRecordId(owner)
      const post = postById.get(postId)
      if (!post) continue

      let entry = grouped.get(postId)
      if (!entry) {
        entry = { post, matches: [], totalMatches: 0, score: 0 }
        grouped.set(postId, entry)
      }
      entry.totalMatches += 1
      entry.score += matchScore
      if (entry.matches.length < maxPerPost) {
        entry.matches.push({ blockId, type, snippet, score: matchScore })
      }
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
    matches: entry.matches
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
