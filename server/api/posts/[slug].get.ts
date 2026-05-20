import { queryDb, useDb } from '../../utils/db'
import { normalizePost } from '../../utils/content'
import { firstRow, stringifyRecordId } from '../../utils/surrealResult'
import { evaluatePostAccess, sanitizePost, type PostVisibility } from '../../utils/visibility'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({ statusCode: 400, message: 'Slug is required' })
  }

  const db = await useDb()
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

  return normalizePost(sanitizePost(post))
})

function toPostVisibility(value: unknown): PostVisibility {
  return value === 'private' || value === 'password' ? value : 'public'
}