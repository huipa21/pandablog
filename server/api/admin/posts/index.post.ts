import { useDb } from '../../../utils/db'
import { buildPostPayload, normalizePost } from '../../../utils/content'
import { firstRow } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'
import { uniquePostSlug } from '../../../utils/posts'
import { syncPostMentions } from '../../../utils/wikiLinks'

export default defineEventHandler(async (event) => {
  const user = await requireAdminUser(event)
  const body = await readBody<Record<string, unknown>>(event)
  const payload = buildPostPayload(body, user.username)

  if (!payload.title) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  }

  const db = await useDb()
  payload.slug = await uniquePostSlug(db, String(payload.slug))

  const response = await db.query(
    'CREATE post CONTENT $post;',
    {
      post: {
        ...payload,
        created_at: new Date(),
        view_count: 0
      }
    }
  )
  const post = firstRow<Record<string, unknown>>(response)

  if (!post) {
    throw createError({ statusCode: 500, statusMessage: 'Post was not created' })
  }

  const normalizedPost = normalizePost(post)
  await syncPostMentions(db, normalizedPost.id, normalizedPost.content_json)

  return normalizedPost
})