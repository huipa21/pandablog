import { queryDbRecord, useDb } from '../../../utils/db'
import { normalizePost } from '../../../utils/content'
import { recordIdPart } from '../../../utils/surrealResult'
import { requireContentManager } from '../../../utils/auth'
import { assertCanManagePostRecord } from '../../../utils/permissions'
import { readPostTaxonomy } from '../../../utils/taxonomy'
import { buildDocFromBlocks, loadBlocksForPost } from '../../../utils/blocks'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'post')
  const db = await useDb()
  const post = await queryDbRecord(db, 'post', id)
  if (!post) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }
  assertCanManagePostRecord(user, post)

  const normalized = normalizePost(post)
  const blocks = await loadBlocksForPost(db, normalized.id)

  return {
    ...normalized,
    content_json: buildDocFromBlocks(blocks),
    blocks,
    ...await readPostTaxonomy(db, id)
  }
})
