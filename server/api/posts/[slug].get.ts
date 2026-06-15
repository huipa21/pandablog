import { queryDb, useDb } from '../../utils/db'
import { normalizePost } from '../../utils/content'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from '../../utils/surrealResult'
import { evaluatePostAccess, sanitizePost, type PostVisibility } from '../../utils/visibility'
import { buildDocFromBlocks, loadBlocksForPost } from '../../utils/blocks'
import { getSessionUser } from '../../utils/auth'
import { assertCanManagePostRecord } from '../../utils/permissions'
import { PUBLIC_POST_CACHE_SECONDS, shouldBypassPublicCache } from '../../utils/public-cache'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Vary', 'Cookie')

  if (await shouldBypassPublicCache(event)) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return await handlePost(event)
  }

  return await cachedPostHandler(event)
})

const cachedPostHandler = defineCachedEventHandler(handlePost, {
  name: 'posts-slug-public-v1',
  maxAge: PUBLIC_POST_CACHE_SECONDS,
  staleMaxAge: PUBLIC_POST_CACHE_SECONDS * 2,
  swr: true,
  varies: ['cookie'],
  getKey: event => `post:${getRouterParam(event, 'slug') ?? ''}`
})

async function handlePost(event: Parameters<typeof shouldBypassPublicCache>[0]) {
  setResponseHeader(event, 'Vary', 'Cookie')

  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({ statusCode: 400, message: 'Slug is required' })
  }

  const db = await useDb()
  const contentManager = await getContentManagerSession(event)
  const visibleStatuses = contentManager ? ['published', 'draft'] : ['published']
  const response = await queryDb(
    db,
    `SELECT id, title, slug, summary, status, cover_image, author, author_username,
      published_at, created_at, updated_at, view_count, word_count, cjk_char_count,
      visibility, password_hint, password_source, password_owner
     FROM post WHERE slug = $slug AND status IN $visibleStatuses LIMIT 1;`,
    { slug, visibleStatuses }
  )
  const post = firstRow<Record<string, unknown>>(response)

  if (!post) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  const isUnpublishedPreview = post.status !== 'published'
  if (isUnpublishedPreview) {
    if (!contentManager) {
      throw createError({ statusCode: 404, message: 'Post not found' })
    }
    assertCanManagePostRecord(contentManager, post)
  }

  const access = await evaluatePostAccess(event, {
    id: stringifyRecordId(post.id),
    visibility: toPostVisibility(post.visibility),
    author: post.author,
    author_username: typeof post.author_username === 'string' ? post.author_username : null
  })

  if (access.state === 'site-private') {
    const currentPath = event.path ?? `/api/posts/${slug}`
    return sendRedirect(event, `/login?redirect=${encodeURIComponent(currentPath)}`, 302)
  }

  if (access.state === 'not-found') {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  if (access.state === 'locked') {
    return {
      locked: true,
      slug: String(post.slug ?? slug),
      title: String(post.title ?? ''),
      visibility: 'password' as const,
      passwordHint: post.password_hint === undefined ? null : post.password_hint
    }
  }

  const sanitized = sanitizePost(post)
  const normalized = normalizePost(sanitized)
  const [blocks, tags] = await Promise.all([
    loadBlocksForPost(db, normalized.id),
    loadTagsForPost(db, normalized.id)
  ])

  return {
    ...normalized,
    content_json: buildDocFromBlocks(blocks),
    blocks,
    tags
  }
}

function toPostVisibility(value: unknown): PostVisibility {
  return value === 'private' || value === 'password' ? value : 'public'
}

async function getContentManagerSession(event: Parameters<typeof getSessionUser>[0]) {
  try {
    const user = await getSessionUser(event)
    if (!user || !isContentManagerRole(user.role)) {
      return null
    }

    return user
  } catch {
    return null
  }
}

function isContentManagerRole(value: unknown) {
  return value === 'superadmin' || value === 'admin' || value === 'author'
}

async function loadTagsForPost(db: Awaited<ReturnType<typeof useDb>>, postRecordId: string) {
  const postId = recordIdPart(postRecordId, 'post')
  const response = await queryDb(
    db,
    `SELECT out.name AS name, out.slug AS slug
     FROM tagged
     WHERE in = type::record('post', $postId)
     FETCH out;`,
    { postId }
  )

  return queryRows<Record<string, unknown>>(response)
    .map((row) => ({
      name: String(row.name ?? '').trim(),
      slug: String(row.slug ?? '').trim()
    }))
    .filter((tag) => tag.name && tag.slug)
}
