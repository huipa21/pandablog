import { queryDbRecord, useDb } from '../../../../../../utils/db'
import { buildDocFromBlocks, computeStatsFromBlocks, loadBlocksForPost, restorePostVersion } from '../../../../../../utils/blocks'
import { recordIdPart } from '../../../../../../utils/surrealResult'
import { requireContentManager } from '../../../../../../utils/auth'
import { assertCanManagePostRecord } from '../../../../../../utils/permissions'
import { normalizePost } from '../../../../../../utils/content'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)
  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'post')
  const version = String(getRouterParam(event, 'version') ?? '').trim()
  if (!version) {
    throw createError({ statusCode: 400, message: 'Version is required' })
  }

  const db = await useDb()
  const post = await queryDbRecord(db, 'post', id)
  if (!post) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }
  assertCanManagePostRecord(user, post)

  const previousBlocks = await loadBlocksForPost(db, `post:${id}`)
  const blocks = await restorePostVersion(db, `post:${id}`, version, previousBlocks)
  const stats = computeStatsFromBlocks(blocks)
  await queryDb(
    db,
    'UPDATE type::record($table, $id) MERGE { word_count: $word_count, cjk_char_count: $cjk_char_count, updated_at: time::now() };',
    { table: 'post', id, ...stats },
    { label: 'post version restore stats' }
  )

  const updated = await queryDbRecord(db, 'post', id)
  const normalized = normalizePost(updated ?? post)
  normalized.word_count = stats.word_count
  normalized.cjk_char_count = stats.cjk_char_count

  return {
    ...normalized,
    content_json: buildDocFromBlocks(blocks),
    blocks,
    restored_version: version
  }
})