import { queryDb, queryDbRecord, useDb } from './db'
import { normalizePost } from './content'
import { firstRow, recordIdPart } from './surrealResult'
import { deleteAllBlocksForPost } from './blocks'
import { mediaRemoveAllReferencesForSource } from './referenceTracker'

export type ArchiveDeleteResult =
  | { kind: 'archived', post: ReturnType<typeof normalizePost> }
  | { kind: 'hard-deleted', id: string }

export async function archiveOrDeletePostById(
  db: Awaited<ReturnType<typeof useDb>>,
  id: string
): Promise<ArchiveDeleteResult> {
  const currentPost = await queryDbRecord(db, 'post', id)

  if (!currentPost) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  if (currentPost.status === 'archived') {
    await hardDeletePost(db, currentPost)
    return { kind: 'hard-deleted', id: `post:${id}` }
  }

  try {
    const response = await archivePost(db, id)
    const post = firstRow<Record<string, unknown>>(response)

    if (!post) {
      throw createError({ statusCode: 404, message: 'Post not found' })
    }

    return { kind: 'archived', post: normalizePost(post) }
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
        return { kind: 'archived', post: normalizePost(retriedPost) }
      }
    }

    // If the write committed but the response path failed (connection reset/timeouts),
    // treat this as success to keep delete/archive idempotent for the UI.
    const archivedPost = await readArchivedPost(db, id)

    if (archivedPost) {
      return { kind: 'archived', post: normalizePost(archivedPost) }
    }

    throw error
  }
}

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
    const post = await queryDbRecord(db, 'post', id, { retryOnReconnect: false })

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
