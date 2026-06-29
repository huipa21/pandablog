import { queryDbRecord, useDb } from '../../../../../utils/db'
import { normalizePost } from '../../../../../utils/content'
import { recordIdPart } from '../../../../../utils/surrealResult'
import { requireContentManager } from '../../../../../utils/auth'
import { assertCanManagePostRecord } from '../../../../../utils/permissions'
import { loadVersionsForPost } from '../../../../../utils/blocks'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)
  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'post')
  const db = await useDb()
  const post = await queryDbRecord(db, 'post', id)
  if (!post) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }
  assertCanManagePostRecord(user, post)

  return {
    post_id: normalizePost(post).id,
    versions: await loadVersionsForPost(db, `post:${id}`)
  }
})