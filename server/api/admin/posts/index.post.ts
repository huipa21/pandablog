import { queryDb, useDb } from '../../../utils/db'
import { buildPostPayload, normalizePost, stringOrNull } from '../../../utils/content'
import { firstRow } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'
import { uniquePostSlug } from '../../../utils/posts'
import { syncPostMentions } from '../../../utils/wikiLinks'
import { readPostTaxonomy, syncPostTaxonomy } from '../../../utils/taxonomy'
import { hashPostPassword } from '../../../utils/post-password'
import type { PostVisibility } from '~/types/content'

export default defineEventHandler(async (event) => {
  const user = await requireAdminUser(event)
  const body = await readBody<Record<string, unknown>>(event)
  const payload = buildPostPayload(body, user.username)
  const visibility = normalizeVisibility(body.visibility)
  const password = typeof body.password === 'string' ? body.password : ''

  if (!payload.title) {
    throw createError({ statusCode: 400, message: 'Title is required' })
  }

  if (visibility === 'password' && password.length === 0) {
    throw createError({ statusCode: 400, message: 'Password is required for password-protected posts' })
  }

  const visibilityUpdates: Record<string, unknown> = { visibility }

  if (visibility === 'password') {
    visibilityUpdates.password_hint = stringOrNull(body.password_hint)
    visibilityUpdates.password_hash = await hashPostPassword(password)
  }

  const db = await useDb()
  payload.slug = await uniquePostSlug(db, String(payload.slug))

  const response = await queryDb(
    db,
    'CREATE post CONTENT $post;',
    {
      post: {
        ...payload,
        ...visibilityUpdates,
        created_at: new Date(),
        view_count: 0
      }
    }
  )
  const post = firstRow<Record<string, unknown>>(response)

  if (!post) {
    throw createError({ statusCode: 500, message: 'Post was not created' })
  }

  const normalizedPost = normalizePost(post)
  await syncPostMentions(db, normalizedPost.id, normalizedPost.content_json)
  await syncPostTaxonomy(
    db,
    normalizedPost.id,
    body.tag_ids,
    body.category_ids,
    body.tag_names,
    body.category_names
  )

  return {
    ...normalizedPost,
    ...await readPostTaxonomy(db, normalizedPost.id)
  }
})

function normalizeVisibility(value: unknown): PostVisibility {
  if (value === 'private' || value === 'password') {
    return value
  }
  return 'public'
}