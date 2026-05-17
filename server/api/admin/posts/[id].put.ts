import { useDb } from '../../../utils/db'
import { buildPostPayload, normalizePost } from '../../../utils/content'
import { firstRow, recordIdPart } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'
import { uniquePostSlug } from '../../../utils/posts'
import { syncPostMentions } from '../../../utils/wikiLinks'

export default defineEventHandler(async (event) => {
  const user = await requireAdminUser(event)
  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'post')
  const body = await readBody<Record<string, unknown>>(event)
  const db = await useDb()

  const existingResponse = await db.query('SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: 'post',
    id
  })
  const existing = firstRow<Record<string, unknown>>(existingResponse)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  const merged = {
    ...existing,
    ...body
  }
  const payload = buildPostPayload(merged, user.username)

  if (!payload.title) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  }

  payload.slug = await uniquePostSlug(db, String(payload.slug), `post:${id}`)
  const clears = cleanOptionalFieldClears(body)

  const response = await db.query(
    `UPDATE type::record($table, $id) MERGE $post ${clears};`,
    {
      table: 'post',
      id,
      post: payload
    }
  )
  const post = firstRow<Record<string, unknown>>(response)

  if (!post) {
    throw createError({ statusCode: 500, statusMessage: 'Post was not updated' })
  }

  const normalizedPost = normalizePost(post)
  await syncPostMentions(db, normalizedPost.id, normalizedPost.content_json)

  return normalizedPost
})

function cleanOptionalFieldClears(body: Record<string, unknown>) {
  const clearSummary = typeof body.summary === 'string' && body.summary.trim() === ''
  const clearCoverImage = typeof body.cover_image === 'string' && body.cover_image.trim() === ''
  const clearPublishedAt = body.status !== 'published'
  const assignments = []

  if (clearSummary) {
    assignments.push('summary = NONE')
  }

  if (clearCoverImage) {
    assignments.push('cover_image = NONE')
  }

  if (clearPublishedAt) {
    assignments.push('published_at = NONE')
  }

  return assignments.length ? `SET ${assignments.join(', ')}` : ''
}