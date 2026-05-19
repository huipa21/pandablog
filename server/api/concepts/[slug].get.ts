import { queryDb, useDb } from '../../utils/db'
import { firstRow, queryRows, stringifyRecordId } from '../../utils/surrealResult'
import { normalizeConcept } from '../../utils/wikiLinks'
import { isAdminAuthenticated } from '../../utils/auth'
import { getSiteVisibility } from '../../utils/visibility'
import type { PostListItem, PostVisibility } from '~/types/content'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({ statusCode: 400, message: 'Slug is required' })
  }

  const isAdmin = await isAdminAuthenticated(event)
  const site = await getSiteVisibility()
  if (!isAdmin && site === 'private') {
    throw createError({ statusCode: 401, message: 'Site is private' })
  }

  const visibilityFilter = isAdmin
    ? ''
    : 'AND (visibility IN ["public", "password"] OR visibility IS NONE)'
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT * FROM concept WHERE slug = $slug LIMIT 1;
     SELECT id, slug, title, summary, cover_image, published_at, visibility
     FROM post
     WHERE status = "published" ${visibilityFilter} AND ->mentions->concept.slug CONTAINS $slug
     ORDER BY published_at DESC;`,
    { slug }
  )
  const concept = firstRow<Record<string, unknown>>(response, 0)

  if (!concept) {
    throw createError({ statusCode: 404, message: 'Concept not found' })
  }

  return {
    concept: normalizeConcept(concept),
    posts: queryRows<Record<string, unknown>>(response, 1).map<PostListItem>((post) => ({
      id: stringifyRecordId(post.id),
      slug: String(post.slug ?? ''),
      title: String(post.title ?? ''),
      summary: post.summary === undefined ? null : post.summary as string | null,
      cover_image: post.cover_image === undefined ? null : post.cover_image as string | null,
      published_at: post.published_at ? String(post.published_at) : null,
      visibility: normalizeVisibility(post.visibility)
    }))
  }
})

function normalizeVisibility(value: unknown): PostVisibility {
  return value === 'private' || value === 'password' ? value : 'public'
}