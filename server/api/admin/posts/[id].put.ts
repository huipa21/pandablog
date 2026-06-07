import { queryDb, useDb } from '../../../utils/db'
import { buildPostPayload, cleanFeatured, normalizePost, stringOrNull } from '../../../utils/content'
import { firstRow, recordIdPart } from '../../../utils/surrealResult'
import { requireContentManager } from '../../../utils/auth'
import { assertCanManagePostRecord } from '../../../utils/permissions'
import { uniquePostSlug } from '../../../utils/posts'
import { hashPostPassword } from '../../../utils/post-password'
import { readPostTaxonomy, syncPostTaxonomy } from '../../../utils/taxonomy'
import { clearOtherFeaturedPosts } from '../../../utils/featuredPost'
import { mediaSyncRecordReferences } from '../../../utils/referenceTracker'
import {
  buildDocFromBlocks,
  extractBlocksFromDoc,
  loadBlocksForPost,
  syncPostBlocks,
  syncPostLinks
} from '../../../utils/blocks'
import { computeContentStats } from '~/utils/contentStats'
import type { BlockRecord, JsonContent, PostVisibility } from '~/types/content'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)
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
  assertCanManagePostRecord(user, existing)

  const previousPost = normalizePost(existing)
  const previousBlocks = await loadBlocksForPost(db, previousPost.id)
  const previousDoc = buildDocFromBlocks(previousBlocks)

  const merged = { ...existing, ...body }
  const payload = buildPostPayload(merged, user.role === 'author' ? user.username : previousPost.author_username)

  if (!payload.title) {
    throw createError({ statusCode: 400, message: 'Title is required' })
  }

  payload.slug = await uniquePostSlug(db, String(payload.slug), `post:${id}`)
  const visibilityUpdate = await resolveVisibilityUpdate(body, existing)
  const clears = cleanOptionalFieldClears(body)

  const updateSql = clears
    ? `UPDATE type::record($table, $id) MERGE $post;\nUPDATE type::record($table, $id) ${clears};`
    : 'UPDATE type::record($table, $id) MERGE $post;'

  const response = await queryDb(
    db,
    updateSql,
    {
      table: 'post',
      id,
      post: {
        ...payload,
        ...visibilityUpdate
      }
    }
  )
  const post = clears
    ? firstRow<Record<string, unknown>>(response, 1) || firstRow<Record<string, unknown>>(response)
    : firstRow<Record<string, unknown>>(response)

  if (!post) {
    throw createError({ statusCode: 500, message: 'Post was not updated' })
  }

  const normalizedPost = normalizePost(post)
  if (normalizedPost.is_featured && normalizedPost.status === 'published') {
    await clearOtherFeaturedPosts(db, id)
  }

  let blocks = previousBlocks
  let reassembledDoc = previousDoc
  let linkedSlugs: string[] = []

  if (Object.prototype.hasOwnProperty.call(body, 'content_json')) {
    const incomingDoc = parseDoc(body.content_json)
    const incomingBlocks = extractBlocksFromDoc(incomingDoc)
    blocks = await syncPostBlocks(db, normalizedPost.id, incomingBlocks)
    linkedSlugs = await syncPostLinks(db, normalizedPost.id, blocks)
    reassembledDoc = buildDocFromBlocks(blocks)
  }

  const stats = computeStatsFromBlocks(blocks)
  await queryDb(
    db,
    'UPDATE type::record($table, $id) MERGE { word_count: $word_count, cjk_char_count: $cjk_char_count };',
    { table: 'post', id, ...stats },
    { label: 'post stats update' }
  )
  normalizedPost.word_count = stats.word_count
  normalizedPost.cjk_char_count = stats.cjk_char_count

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
    [previousPost.cover_image, previousDoc],
    [normalizedPost.cover_image, reassembledDoc]
  )

  return {
    ...normalizedPost,
    content_json: reassembledDoc,
    blocks,
    linked_post_slugs: linkedSlugs,
    ...await readPostTaxonomy(db, id)
  }
})

function cleanOptionalFieldClears(body: Record<string, unknown>) {
  const clearSummary = typeof body.summary === 'string' && body.summary.trim() === ''
  const clearCoverImage = typeof body.cover_image === 'string' && body.cover_image.trim() === ''
  const clearFeaturedAt = Object.prototype.hasOwnProperty.call(body, 'is_featured') && !cleanFeatured(body.is_featured)
  const clearPublishedAt = Object.prototype.hasOwnProperty.call(body, 'status') && body.status !== 'published'
  const assignments: string[] = []

  if (clearSummary) assignments.push('summary = NONE')
  if (clearCoverImage) assignments.push('cover_image = NONE')
  if (clearFeaturedAt) assignments.push('featured_at = NONE')
  if (clearPublishedAt) assignments.push('published_at = NONE')
  if (body.visibility === 'public' || body.visibility === 'private') {
    assignments.push('password_hash = NONE', 'password_hint = NONE')
  }

  return assignments.length ? `SET ${assignments.join(', ')}` : ''
}

async function resolveVisibilityUpdate(body: Record<string, unknown>, existing: Record<string, unknown>) {
  const visibility = normalizeVisibility(body.visibility ?? existing.visibility)
  const currentHash = typeof existing.password_hash === 'string' ? existing.password_hash : null
  const updates: Record<string, unknown> = { visibility }

  if (visibility === 'password') {
    const password = typeof body.password === 'string' ? body.password : ''
    if (password.length > 0) {
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
  }

  return updates
}

function normalizeVisibility(value: unknown): PostVisibility {
  if (value === 'private' || value === 'password') return value
  return 'public'
}

function parseDoc(value: unknown): JsonContent | null {
  if (value && typeof value === 'object') return value as JsonContent
  return null
}

function computeStatsFromBlocks(blocks: BlockRecord[]) {
  const combined = blocks.map((block) => block.text ?? '').join('\n')
  return computeContentStats(combined)
}
