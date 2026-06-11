import { queryDb, queryDbRecord, useDb } from '../../../utils/db'
import { buildPostPayload, normalizePost, stringOrNull } from '../../../utils/content'
import { firstRow, recordIdPart } from '../../../utils/surrealResult'
import { requireContentManager } from '../../../utils/auth'
import { assertCanManagePostRecord } from '../../../utils/permissions'
import { uniquePostSlug } from '../../../utils/posts'
import { hashPostPassword } from '../../../utils/post-password'
import { readPostTaxonomy, syncPostTaxonomy } from '../../../utils/taxonomy'
import { mediaCascadeVisibilityForPost, mediaSyncRecordReferences } from '../../../utils/referenceTracker'
import {
  buildDocFromBlocks,
  extractBlocksFromDoc,
  flattenNodeText,
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

  const existing = await queryDbRecord(db, 'post', id)
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

  const desiredSlug = String(payload.slug)
  payload.slug = desiredSlug === previousPost.slug
    ? previousPost.slug
    : await uniquePostSlug(db, desiredSlug, `post:${id}`)
  const { updates: visibilityUpdate, ownerAction } = await resolveVisibilityUpdate(body, existing, user.id)
  const clears = cleanOptionalFieldClears(body)

  const statements: string[] = ['UPDATE type::record($table, $id) MERGE $post;']
  if (clears) {
    statements.push(`UPDATE type::record($table, $id) ${clears};`)
  }
  if (ownerAction?.kind === 'set') {
    statements.push('UPDATE type::record($table, $id) SET password_owner = type::record($userTable, $ownerId), password_hash = NONE;')
  } else if (ownerAction?.kind === 'clear') {
    statements.push('UPDATE type::record($table, $id) SET password_owner = NONE;')
  }
  const updateSql = statements.join('\n')

  const params: Record<string, unknown> = {
    table: 'post',
    id,
    post: {
      ...payload,
      ...visibilityUpdate
    }
  }
  if (ownerAction?.kind === 'set') {
    params.userTable = 'users'
    params.ownerId = ownerAction.userId
  }

  const response = await queryDb(db, updateSql, params)
  const post = statements.length > 1
    ? firstRow<Record<string, unknown>>(response, statements.length - 1) || firstRow<Record<string, unknown>>(response)
    : firstRow<Record<string, unknown>>(response)

  if (!post) {
    throw createError({ statusCode: 500, message: 'Post was not updated' })
  }

  const normalizedPost = normalizePost(post)
  let blocks = previousBlocks
  let reassembledDoc = previousDoc
  let linkedSlugs: string[] = []

  if (Object.prototype.hasOwnProperty.call(body, 'content_json')) {
    const incomingDoc = parseDoc(body.content_json)
    const incomingBlocks = extractBlocksFromDoc(incomingDoc)
    blocks = await syncPostBlocks(db, normalizedPost.id, incomingBlocks, previousBlocks)
    linkedSlugs = await syncPostLinks(db, normalizedPost.id, blocks)
    reassembledDoc = buildDocFromBlocks(blocks)
  }

  const stats = computeStatsFromBlocks(blocks)
  if (stats.word_count !== previousPost.word_count || stats.cjk_char_count !== previousPost.cjk_char_count) {
    await queryDb(
      db,
      'UPDATE type::record($table, $id) MERGE { word_count: $word_count, cjk_char_count: $cjk_char_count };',
      { table: 'post', id, ...stats },
      { label: 'post stats update' }
    )
  }
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
  const mediaReferences = await mediaSyncRecordReferences(
    db,
    normalizedPost.id,
    [previousPost.cover_image, previousDoc],
    [normalizedPost.cover_image, reassembledDoc]
  )
  if (mediaReferences.changed || normalizedPost.visibility !== previousPost.visibility) {
    await mediaCascadeVisibilityForPost(db, normalizedPost.id, normalizedPost.visibility ?? 'public', [normalizedPost.cover_image, reassembledDoc])
  }

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
  const clearPublishedAt = Object.prototype.hasOwnProperty.call(body, 'status') && body.status !== 'published'
  const clearPasswordHint = Object.prototype.hasOwnProperty.call(body, 'password_hint') && stringOrNull(body.password_hint) === null
  const assignments: string[] = []

  if (clearSummary) assignments.push('summary = NONE')
  if (clearCoverImage) assignments.push('cover_image = NONE')
  if (clearPublishedAt) assignments.push('published_at = NONE')
  if (clearPasswordHint || body.visibility === 'public' || body.visibility === 'private') {
    assignments.push('password_hint = NONE')
  }
  if (body.visibility === 'public' || body.visibility === 'private') {
    assignments.push("password_source = 'custom'", 'password_hash = NONE', 'password_owner = NONE')
  }

  return assignments.length ? `SET ${assignments.join(', ')}` : ''
}

async function resolveVisibilityUpdate(body: Record<string, unknown>, existing: Record<string, unknown>, currentUserId: string) {
  const visibility = normalizeVisibility(body.visibility ?? existing.visibility)
  const updates: Record<string, unknown> = { visibility }
  let ownerAction: { kind: 'set', userId: string } | { kind: 'clear' } | null = null

  if (visibility !== 'password') {
    return { updates, ownerAction }
  }

  const currentHash = typeof existing.password_hash === 'string' ? existing.password_hash : null
  const password = typeof body.password === 'string' ? body.password : ''
  const hasPasswordInput = Object.prototype.hasOwnProperty.call(body, 'password')
  const passwordSource = hasPasswordInput
    ? password.length > 0 ? 'custom' : 'user'
    : normalizePasswordSource(body.password_source ?? existing.password_source)
  updates.password_source = passwordSource

  if (passwordSource === 'user') {
    const userId = recordIdPart(currentUserId, 'users')
    if (!userId) {
      throw createError({ statusCode: 400, message: 'Could not resolve session user' })
    }
    ownerAction = { kind: 'set', userId }
  } else {
    if (password.length > 0) {
      updates.password_hash = await hashPostPassword(password)
    } else if (currentHash) {
      updates.password_hash = currentHash
    } else {
      throw createError({ statusCode: 400, message: 'Password is required for password-protected posts' })
    }
    ownerAction = { kind: 'clear' }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'password_hint')) {
    const passwordHint = stringOrNull(body.password_hint)
    if (passwordHint) {
      updates.password_hint = passwordHint
    }
  }

  return { updates, ownerAction }
}

function normalizeVisibility(value: unknown): PostVisibility {
  if (value === 'private' || value === 'password') return value
  return 'public'
}

function normalizePasswordSource(value: unknown): 'custom' | 'user' {
  return value === 'user' ? 'user' : 'custom'
}

function parseDoc(value: unknown): JsonContent | null {
  if (value && typeof value === 'object') return value as JsonContent
  return null
}

function computeStatsFromBlocks(blocks: BlockRecord[]) {
  // Stats count authored characters only. Recompute from the node (base text)
  // rather than block.text, which also carries annotation readings for search.
  const combined = blocks.map((block) => flattenNodeText(block.node)).join('\n')
  return computeContentStats(combined)
}
