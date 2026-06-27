import type { H3Event } from 'h3'
import { queryDb, useDb } from '../../../utils/db'
import { isAdminAuthenticated } from '../../../utils/auth'
import { firstRow, queryRows, stringifyRecordId } from '../../../utils/surrealResult'
import { PUBLIC_LIST_CACHE_SECONDS, shouldBypassPublicCache } from '../../../utils/public-cache'
import { extractRelatedPostSlugsFromBlocks, loadBlocksForPost } from '../../../utils/blocks'
import type { PostListItem, PostVisibility } from '~/types/content'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Vary', 'Cookie')

  if (await shouldBypassPublicCache(event)) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return await handleRelatedPosts(event)
  }

  return await cachedRelatedPostsHandler(event)
})

const cachedRelatedPostsHandler = defineCachedEventHandler(handleRelatedPosts, {
  name: 'posts-related-public-v1',
  maxAge: PUBLIC_LIST_CACHE_SECONDS,
  staleMaxAge: PUBLIC_LIST_CACHE_SECONDS * 2,
  swr: true,
  varies: ['cookie'],
  getKey: event => `posts-related:${getRouterParam(event, 'slug') ?? ''}`
})

async function handleRelatedPosts(event: H3Event) {
  const slug = String(getRouterParam(event, 'slug') ?? '').trim()
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Slug is required' })
  }

  const isAdmin = await isAdminAuthenticated(event)
  const visibilityFilter = isAdmin
    ? ''
    : 'AND (visibility IN ["public", "password"] OR visibility IS NONE)'
  const db = await useDb()
  const sourceResponse = await queryDb(
    db,
    `SELECT id FROM post
     WHERE slug = $slug
       AND status = "published"
       ${visibilityFilter}
     LIMIT 1;`,
    { slug }
  )
  const source = firstRow<{ id?: unknown }>(sourceResponse)
  if (!source?.id) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  const sourceId = stringifyRecordId(source.id)
  const relatedSlugs = extractRelatedPostSlugsFromBlocks(await loadBlocksForPost(db, sourceId))

  if (!relatedSlugs.length) {
    return { posts: [] }
  }

  const relatedResponse = await queryDb(
    db,
    `SELECT id, slug, title, published_at, visibility
     FROM post
     WHERE slug IN $relatedSlugs
       AND status = "published"
       ${visibilityFilter};`,
    { relatedSlugs }
  )

  const postsBySlug = new Map(queryRows<Record<string, unknown>>(relatedResponse)
    .map<PostListItem>((post) => ({
      id: stringifyRecordId(post.id),
      slug: String(post.slug ?? ''),
      title: String(post.title ?? ''),
      summary: null,
      excerpt: null,
      cover_image: null,
      published_at: post.published_at ? String(post.published_at) : null,
      visibility: normalizeVisibility(post.visibility)
    }))
    .filter((post) => post.id && post.slug && post.title)
    .map((post) => [post.slug, post]))
  const posts = relatedSlugs
    .map((relatedSlug) => postsBySlug.get(relatedSlug))
    .filter((post): post is PostListItem => Boolean(post))

  return { posts }
}

function normalizeVisibility(value: unknown): PostVisibility {
  return value === 'private' || value === 'password' ? value : 'public'
}