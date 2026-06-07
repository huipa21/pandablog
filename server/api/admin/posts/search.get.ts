import { queryDb, useDb } from '../../../utils/db'
import { queryRows, recordIdPart, stringifyRecordId } from '../../../utils/surrealResult'
import { requireContentManager } from '../../../utils/auth'

/**
 * Search posts by title or slug — used by the editor's Related Post picker.
 * Returns at most 20 suggestions ordered by recency / relevance.
 */
export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)
  const q = String(getQuery(event).q ?? '').trim()

  if (!q) {
    return { items: [] }
  }

  const db = await useDb()
  const ownerFilter = user.role === 'author'
    ? 'AND (author = type::record($userTable, $userId) OR (author IS NONE AND author_username = $username))'
    : ''
  const response = await queryDb(
    db,
    `SELECT id, slug, title FROM post
     WHERE status != 'archived'
       ${ownerFilter}
       AND (string::lowercase(title) CONTAINS $needle OR slug CONTAINS $needle)
     ORDER BY updated_at DESC
     LIMIT 20;`,
    { needle: q.toLowerCase(), userTable: 'users', userId: recordIdPart(user.id, 'users'), username: user.username }
  )

  const items = queryRows<{ id: unknown, slug?: unknown, title?: unknown }>(response, 0).map((row) => ({
    id: stringifyRecordId(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? '')
  })).filter((item) => item.slug)

  return { items }
})
