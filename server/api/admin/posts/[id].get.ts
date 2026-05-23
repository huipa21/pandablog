import { queryDb, useDb } from '../../../utils/db'
import { normalizePost } from '../../../utils/content'
import { firstRow, recordIdPart } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'
import { readPostTaxonomy } from '../../../utils/taxonomy'
import { buildDocFromBlocks, loadBlocksForPost } from '../../../utils/blocks'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'post')
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: 'post',
    id
  })
  const post = firstRow<Record<string, unknown>>(response)
  if (!post) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  const normalized = normalizePost(post)
  const blocks = await loadBlocksForPost(db, normalized.id)

  return {
    ...normalized,
    content_json: buildDocFromBlocks(blocks),
    blocks,
    ...await readPostTaxonomy(db, id)
  }
})
