import { queryDb, useDb } from '../../utils/db'
import { normalizePost } from '../../utils/content'
import { firstRow, recordIdPart, stringifyRecordId } from '../../utils/surrealResult'
import { evaluatePostAccess, sanitizePost, type PostVisibility } from '../../utils/visibility'
import { buildDocFromBlocks, loadBlocksForPost } from '../../utils/blocks'
import { isAdminAuthenticated } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({ statusCode: 400, message: 'Slug is required' })
  }

  const db = await useDb()
  const isAdmin = await isAdminAuthenticated(event)
  const response = await queryDb(
    db,
    'SELECT * FROM post WHERE slug = $slug AND status = "published" LIMIT 1;',
    { slug }
  )
  const post = firstRow<Record<string, unknown>>(response)

  if (!post) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  const access = await evaluatePostAccess(event, {
    id: stringifyRecordId(post.id),
    visibility: toPostVisibility(post.visibility)
  })

  if (access.state === 'site-private') {
    const currentPath = event.path ?? `/api/posts/${slug}`
    return sendRedirect(event, `/admin/login?redirect=${encodeURIComponent(currentPath)}`, 302)
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

  const visiblePost = isAdmin ? post : await incrementPostViewCount(db, post)
  const sanitized = sanitizePost(visiblePost)
  const normalized = normalizePost(sanitized)
  const blocks = await loadBlocksForPost(db, normalized.id)

  return {
    ...normalized,
    content_json: buildDocFromBlocks(blocks),
    blocks
  }
})

function toPostVisibility(value: unknown): PostVisibility {
  return value === 'private' || value === 'password' ? value : 'public'
}

async function incrementPostViewCount(db: Awaited<ReturnType<typeof useDb>>, post: Record<string, unknown>) {
  const id = recordIdPart(stringifyRecordId(post.id), 'post')
  const response = await queryDb(
    db,
    'UPDATE type::record($table, $id) SET view_count += 1 RETURN AFTER;',
    { table: 'post', id },
    { label: 'post view count increment', timeoutMs: 10_000 }
  )

  return firstRow<Record<string, unknown>>(response) ?? post
}
