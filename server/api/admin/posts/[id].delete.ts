import { queryDb, useDb } from '../../../utils/db'
import { normalizePost } from '../../../utils/content'
import { firstRow, recordIdPart } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'post')
  const db = await useDb()
  try {
    const response = await queryDb(
      db,
      'UPDATE type::record($table, $id) MERGE { status: "archived", published_at: NONE, updated_at: time::now() } RETURN AFTER;',
      {
        table: 'post',
        id
      }
    )
    const post = firstRow<Record<string, unknown>>(response)

    if (!post) {
      throw createError({ statusCode: 404, message: 'Post not found' })
    }

    return normalizePost(post)
  } catch (error: any) {
    // If the write committed but the response path failed (connection reset/timeouts),
    // treat this as success to keep delete/archive idempotent for the UI.
    const archivedPost = await readArchivedPost(db, id)

    if (archivedPost) {
      return normalizePost(archivedPost)
    }

    throw error
  }
})

async function readArchivedPost(db: Awaited<ReturnType<typeof useDb>>, id: string) {
  try {
    const response = await queryDb(
      db,
      'SELECT * FROM type::record($table, $id) LIMIT 1;',
      { table: 'post', id },
      { retryOnReconnect: false }
    )
    const post = firstRow<Record<string, unknown>>(response)

    if (post?.status === 'archived') {
      return post
    }

    return null
  } catch {
    return null
  }
}