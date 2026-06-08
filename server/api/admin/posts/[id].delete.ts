import { queryDbRecord, useDb } from '../../../utils/db'
import { recordIdPart } from '../../../utils/surrealResult'
import { requireContentManager } from '../../../utils/auth'
import { assertCanManagePostRecord } from '../../../utils/permissions'
import { archiveOrDeletePostById } from '../../../utils/postArchiveDelete'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'post')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Invalid post id' })
  }

  const db = await useDb()
  const existing = await queryDbRecord(db, 'post', id)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }
  assertCanManagePostRecord(user, existing)

  const result = await archiveOrDeletePostById(db, id)

  if (result.kind === 'hard-deleted') {
    return { id: result.id, deleted: true, hard_deleted: true }
  }

  return result.post
})