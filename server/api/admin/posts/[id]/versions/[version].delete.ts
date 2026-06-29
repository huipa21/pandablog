import { queryDbRecord, useDb } from '../../../../../utils/db'
import { deletePostVersion } from '../../../../../utils/blocks'
import { recordIdPart } from '../../../../../utils/surrealResult'
import { requireContentManager } from '../../../../../utils/auth'
import { assertCanManagePostRecord } from '../../../../../utils/permissions'

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

  await deletePostVersion(db, `post:${id}`, version)
  return { deleted: true, version }
})