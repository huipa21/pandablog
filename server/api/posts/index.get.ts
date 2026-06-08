import { queryDb, useDb } from '../../utils/db'
import { firstRow, queryRows, stringifyRecordId } from '../../utils/surrealResult'
import { isAdminAuthenticated } from '../../utils/auth'
import type { PostListItem, PostVisibility } from '~/types/content'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit ?? 20), 100)
  const start = Math.max(Number(query.start ?? 0), 0)
  const tag = String(query.tag ?? '').trim()
  const category = String(query.category ?? '').trim()
  const isAdmin = await isAdminAuthenticated(event)

  const visibilityFilter = isAdmin
    ? ''
    : 'AND (visibility IN ["public", "password"] OR visibility IS NONE)'
  const db = await useDb()
  const filteredPostIds = await resolveFilteredPostIds(db, { tag, category })

  if (filteredPostIds && filteredPostIds.length === 0) {
    return { posts: [], total: 0, limit, start }
  }

  const taxonomyFilter = filteredPostIds ? 'AND id IN $postIds' : ''
  const response = await queryDb(
    db,
    `SELECT id, slug, title, summary, cover_image, published_at, visibility
     FROM post
     WHERE status = "published" ${visibilityFilter} ${taxonomyFilter}
     ORDER BY published_at DESC, id DESC
     LIMIT $limit START $start;
     SELECT count() AS total FROM post WHERE status = "published" ${visibilityFilter} ${taxonomyFilter} GROUP ALL;`,
    { limit, start, postIds: filteredPostIds ?? [] }
  )
  const posts = queryRows<Record<string, unknown>>(response, 0).map<PostListItem>((post) => ({
    id: stringifyRecordId(post.id),
    slug: String(post.slug ?? ''),
    title: String(post.title ?? ''),
    summary: post.summary === undefined ? null : post.summary as string | null,
    cover_image: post.cover_image === undefined ? null : post.cover_image as string | null,
    published_at: post.published_at ? String(post.published_at) : null,
    visibility: normalizeVisibility(post.visibility)
  }))
  const count = firstRow<{ total?: number }>(response, 1)

  return {
    posts,
    total: Number(count?.total ?? posts.length),
    limit,
    start
  }
})

function normalizeVisibility(value: unknown): PostVisibility {
  return value === 'private' || value === 'password' ? value : 'public'
}

async function resolveFilteredPostIds(db: Awaited<ReturnType<typeof useDb>>, filters: { tag: string, category: string }) {
  const groups: unknown[][] = []

  if (filters.tag) {
    groups.push(await relationPostIds(db, 'tag', 'tagged', filters.tag))
  }

  if (filters.category) {
    groups.push(await relationPostIds(db, 'category', 'categorized_as', filters.category))
  }

  if (!groups.length) {
    return null
  }

  const maps = groups.map((group) => new Map(group.map((id) => [stringifyRecordId(id), id])))
  const [firstMap] = maps
  if (!firstMap) {
    return []
  }

  return Array.from(firstMap.keys())
    .filter((key) => maps.every((map) => map.has(key)))
    .map((key) => firstMap.get(key))
}

async function relationPostIds(db: Awaited<ReturnType<typeof useDb>>, table: 'tag' | 'category', relation: 'tagged' | 'categorized_as', slug: string) {
  const lookup = await queryDb(db, `SELECT id FROM ${table} WHERE slug = $slug LIMIT 1;`, { slug })
  const item = firstRow<{ id: unknown }>(lookup)

  if (!item) {
    return []
  }

  const response = await queryDb(db, `SELECT in FROM ${relation} WHERE out = $id;`, { id: item.id })
  return queryRows<Record<string, unknown>>(response).map((row) => row.in).filter(Boolean)
}