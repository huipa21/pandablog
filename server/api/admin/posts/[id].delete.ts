import { useDb } from '../../../utils/db'
import { recordIdPart } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'
import { archiveOrDeletePostById } from '../../../utils/postArchiveDelete'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'post')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Invalid post id' })
  }

  const db = await useDb()
  const result = await archiveOrDeletePostById(db, id)

  if (result.kind === 'hard-deleted') {
    return { id: result.id, deleted: true, hard_deleted: true }
  }

  return result.post
})