import { queryDb, useDb } from '../../../utils/db'
import { buildPostPayload, normalizePost, stringOrNull } from '../../../utils/content'
import { firstRow, recordIdPart, stringifyRecordId } from '../../../utils/surrealResult'
import { requireContentManager } from '../../../utils/auth'
import { uniquePostSlug } from '../../../utils/posts'
import { readPostTaxonomy, syncPostTaxonomy } from '../../../utils/taxonomy'
import { hashPostPassword } from '../../../utils/post-password'
import { clearOtherFeaturedPosts } from '../../../utils/featuredPost'
import { mediaSyncRecordReferences } from '../../../utils/referenceTracker'
import { buildDocFromBlocks, extractBlocksFromDoc, syncPostBlocks, syncPostLinks } from '../../../utils/blocks'
import type { JsonContent, PostVisibility } from '~/types/content'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)
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

  await queryDb(
    db,
    'UPDATE type::record($table, $id) SET author = type::record($userTable, $userId);',
    { table: 'post', id: recordIdPart(stringifyRecordId(post.id), 'post'), userTable: 'users', userId: recordIdPart(user.id, 'users') }
  )

  const normalizedPost = normalizePost(post)
  if (normalizedPost.is_featured && normalizedPost.status === 'published') {
    await clearOtherFeaturedPosts(db, recordIdPart(normalizedPost.id, 'post'))
  }

  const incomingDoc = parseDoc(body.content_json)
  const incomingBlocks = extractBlocksFromDoc(incomingDoc)
  const blocks = await syncPostBlocks(db, normalizedPost.id, incomingBlocks)
  const linkedSlugs = await syncPostLinks(db, normalizedPost.id, blocks)
  const reassembledDoc = buildDocFromBlocks(blocks)

  await syncPostTaxonomy(
    db,
    normalizedPost.id,
    body.tag_ids,
    body.category_ids,
    body.tag_names,
    body.category_names
  )
  await mediaSyncRecordReferences(db, normalizedPost.id, [], [normalizedPost.cover_image, reassembledDoc])

  return {
    ...normalizedPost,
    content_json: reassembledDoc,
    blocks,
    linked_post_slugs: linkedSlugs,
    ...await readPostTaxonomy(db, normalizedPost.id)
  }
})

function normalizeVisibility(value: unknown): PostVisibility {
  if (value === 'private' || value === 'password') return value
  return 'public'
}

function parseDoc(value: unknown): JsonContent | null {
  if (value && typeof value === 'object') return value as JsonContent
  return null
}
