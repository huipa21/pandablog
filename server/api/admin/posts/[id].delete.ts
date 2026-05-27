import { queryDb, useDb } from '../../../utils/db'
import { normalizePost } from '../../../utils/content'
import { firstRow, recordIdPart } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'
import { deleteAllBlocksForPost } from '../../../utils/blocks'
import { mediaRemoveAllReferencesForSource } from '../../../utils/referenceTracker'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'post')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Invalid post id' })
  }

  const db = await useDb()
  const currentResponse = await queryDb(
    db,
    'SELECT * FROM type::record($table, $id) LIMIT 1;',
    { table: 'post', id }
  )
  const currentPost = firstRow<Record<string, unknown>>(currentResponse)

  if (!currentPost) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  if (currentPost.status === 'archived') {
    await hardDeletePost(db, currentPost)
    return { id: `post:${id}`, deleted: true, hard_deleted: true }
  }

  try {
    const response = await archivePost(db, id)
    const post = firstRow<Record<string, unknown>>(response)

    if (!post) {
      throw createError({ statusCode: 404, message: 'Post not found' })
    }

    return normalizePost(post)
  } catch (error: any) {
    if (isLegacyPostFieldError(error)) {
      await queryDb(
        db,
        'UPDATE type::record($table, $id) UNSET content_json, content_text;',
        { table: 'post', id }
      )

      const retryResponse = await archivePost(db, id)
      const retriedPost = firstRow<Record<string, unknown>>(retryResponse)

      if (retriedPost) {
        return normalizePost(retriedPost)
      }
    }

    // If the write committed but the response path failed (connection reset/timeouts),
    // treat this as success to keep delete/archive idempotent for the UI.
    const archivedPost = await readArchivedPost(db, id)

    if (archivedPost) {
      return normalizePost(archivedPost)
    }

    throw error
  }
})

function archivePost(db: Awaited<ReturnType<typeof useDb>>, id: string) {
  return queryDb(
    db,
    'UPDATE type::record($table, $id) MERGE { status: "archived", published_at: NONE, updated_at: time::now() } RETURN AFTER;',
    {
      table: 'post',
      id
    }
  )
}

function isLegacyPostFieldError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.includes("Found field 'content_json', but no such field exists for table 'post'")
    || message.includes("Found field 'content_text', but no such field exists for table 'post'")
}

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

async function hardDeletePost(db: Awaited<ReturnType<typeof useDb>>, record: Record<string, unknown>) {
  const post = normalizePost(record)
  const postId = recordIdPart(post.id, 'post')

  await mediaRemoveAllReferencesForSource(db, post.id)

  await Promise.all([
    queryDb(db, 'DELETE tagged WHERE in = type::record($table, $id);', {
      table: 'post',
      id: postId
    }),
    queryDb(db, 'DELETE categorized_as WHERE in = type::record($table, $id);', {
      table: 'post',
      id: postId
    }),
    queryDb(db, 'DELETE links WHERE in = type::record($table, $id) OR out = type::record($table, $id);', {
      table: 'post',
      id: postId
    }),
    deleteAllBlocksForPost(db, post.id)
  ])

  await queryDb(db, 'DELETE FROM type::record($table, $id);', {
    table: 'post',
    id: postId
  })
}