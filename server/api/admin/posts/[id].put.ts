import { queryDb, useDb } from '../../../utils/db'
import { buildPostPayload, normalizePost, stringOrNull } from '../../../utils/content'
import { firstRow, recordIdPart } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'
import { uniquePostSlug } from '../../../utils/posts'
import { syncPostMentions } from '../../../utils/wikiLinks'
import { hashPostPassword } from '../../../utils/post-password'
import { readPostTaxonomy, syncPostTaxonomy } from '../../../utils/taxonomy'
import { mediaSyncRecordReferences } from '../../../utils/referenceTracker'
import type { PostVisibility } from '~/types/content'

export default defineEventHandler(async (event) => {
  const user = await requireAdminUser(event)
  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'post')
  const body = await readBody<Record<string, unknown>>(event)
  const db = await useDb()

  const existingResponse = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: 'post',
    id
  })
  const existing = firstRow<Record<string, unknown>>(existingResponse)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  const previousPost = normalizePost(existing)

  const merged = {
    ...existing,
    ...body
  }
  const payload = buildPostPayload(merged, user.username)

  if (!payload.title) {
    throw createError({ statusCode: 400, message: 'Title is required' })
  }

  payload.slug = await uniquePostSlug(db, String(payload.slug), `post:${id}`)
  const visibilityUpdate = await resolveVisibilityUpdate(body, existing)
  const clears = cleanOptionalFieldClears(body)

  // Always run the MERGE update first
  const response = await queryDb(
    db,
    `UPDATE type::record($table, $id) MERGE $post;`,
    {
      table: 'post',
      id,
      post: {
        ...payload,
        ...visibilityUpdate
      }
    }
  )
  let post = firstRow<Record<string, unknown>>(response)

  // If there are fields to clear, run a second SET update
  if (clears) {
    const clearResponse = await queryDb(
      db,
      `UPDATE type::record($table, $id) ${clears};`,
      {
        table: 'post',
        id
      }
    )
    post = firstRow<Record<string, unknown>>(clearResponse) || post
  }

  if (!post) {
    throw createError({ statusCode: 500, message: 'Post was not updated' })
  }

  const normalizedPost = normalizePost(post)
  await syncPostMentions(db, normalizedPost.id, normalizedPost.content_json)
  await syncPostTaxonomy(
    db,
    id,
    body.tag_ids,
    body.category_ids,
    body.tag_names,
    body.category_names
  )
  await mediaSyncRecordReferences(
    db,
    normalizedPost.id,
    [previousPost.cover_image, previousPost.content_json],
    [normalizedPost.cover_image, normalizedPost.content_json]
  )

  return {
    ...normalizedPost,
    ...await readPostTaxonomy(db, id)
  }
})

function cleanOptionalFieldClears(body: Record<string, unknown>) {
  const clearSummary = typeof body.summary === 'string' && body.summary.trim() === ''
  const clearCoverImage = typeof body.cover_image === 'string' && body.cover_image.trim() === ''
  const clearPublishedAt = Object.prototype.hasOwnProperty.call(body, 'status') && body.status !== 'published'
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

  if (body.visibility === 'public' || body.visibility === 'private') {
    assignments.push('password_hash = NONE', 'password_hint = NONE')
  }

  return assignments.length ? `SET ${assignments.join(', ')}` : ''
}

async function resolveVisibilityUpdate(body: Record<string, unknown>, existing: Record<string, unknown>) {
  const visibility = normalizeVisibility(body.visibility ?? existing.visibility)
  const currentHash = typeof existing.password_hash === 'string' ? existing.password_hash : null
  const updates: Record<string, unknown> = {
    visibility
  }

  if (visibility === 'password') {
    const password = typeof body.password === 'string' ? body.password : ''
    const hasPasswordInput = password.length > 0

    if (hasPasswordInput) {
      updates.password_hash = await hashPostPassword(password)
    } else if (currentHash) {
      updates.password_hash = currentHash
    } else {
      throw createError({ statusCode: 400, message: 'Password is required for password-protected posts' })
    }

    if (Object.prototype.hasOwnProperty.call(body, 'password_hint')) {
      updates.password_hint = stringOrNull(body.password_hint)
    } else {
      updates.password_hint = stringOrNull(existing.password_hint)
    }

    return updates
  }

  return updates
}

function normalizeVisibility(value: unknown): PostVisibility {
  if (value === 'private' || value === 'password') {
    return value
  }
  return 'public'
}