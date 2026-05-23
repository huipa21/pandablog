import { queryDb, useDb } from '../../../utils/db'
import { queryRows, stringifyRecordId } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'

/**
 * Search posts by title or slug — used by the editor's Related Post picker.
 * Returns at most 20 suggestions ordered by recency / relevance.
 */
export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const q = String(getQuery(event).q ?? '').trim()

  if (!q) {
    return { items: [] }
  }

  const db = await useDb()
  const pattern = `%${q.toLowerCase()}%`
  const response = await queryDb(
    db,
    `SELECT id, slug, title FROM post
     WHERE status != 'archived'
       AND (string::lowercase(title) CONTAINS $needle OR slug CONTAINS $needle)
     ORDER BY updated_at DESC
     LIMIT 20;`,
    { needle: pattern.replace(/%/g, '') }
  )

  const items = queryRows<{ id: unknown, slug?: unknown, title?: unknown }>(response, 0).map((row) => ({
    id: stringifyRecordId(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? '')
  })).filter((item) => item.slug)

  return { items }
})
