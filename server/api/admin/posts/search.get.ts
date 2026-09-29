import { queryDb, useDb } from '../../../utils/db'
import { queryRows, recordIdPart, stringifyRecordId } from '../../../utils/surrealResult'
import { requireContentManager } from '../../../utils/auth'
import { expandFuzzyNeedles } from '../../../utils/searchTerms'
import { clampFtsNeedle } from '../../../utils/fuzzy'

const MAX_ITEMS = 20

/**
 * Search posts by title — used by the editor's Related Post picker.
 * Without a query: first 20 posts by title. With a query: exact matches
 * (full-text title match or plain substring) ranked by relevance, followed by
 * typo-tolerant (fuzzy) title matches.
 */
export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)
  const q = String(getQuery(event).q ?? '').trim().slice(0, 200)

  const db = await useDb()
  const ownerFilter = user.role === 'author'
    ? 'AND (author = type::record($userTable, $userId) OR (author IS NONE AND author_username = $username))'
    : ''
  const baseParams = { userTable: 'users', userId: recordIdPart(user.id, 'users'), username: user.username }

  if (!q) {
    const response = await queryDb(
      db,
      `SELECT id, slug, title, updated_at FROM post
       WHERE status != 'archived'
         ${ownerFilter}
       ORDER BY title ASC
       LIMIT ${MAX_ITEMS};`,
      baseParams
    )
    return { items: toItems(queryRows(response, 0)) }
  }

  const variants = (await expandFuzzyNeedles(db, 'post_title', [q])).get(q) ?? []
  const params: Record<string, unknown> = {
    ...baseParams,
    needle: clampFtsNeedle(q),
    lower: q.toLowerCase()
  }
  const statements = [
    `SELECT id, slug, title, search::score(0) AS score FROM post
     WHERE status != 'archived'
       ${ownerFilter}
       AND (title @0@ $needle OR string::lowercase(title) CONTAINS $lower)
     ORDER BY score DESC
     LIMIT ${MAX_ITEMS};`
  ]
  variants.forEach((variant, index) => {
    params[`fuzzy_${index}`] = clampFtsNeedle(variant.text)
    statements.push(
      `SELECT id, slug, title, search::score(0) AS score FROM post
       WHERE status != 'archived'
         ${ownerFilter}
         AND title @0@ $fuzzy_${index}
       ORDER BY score DESC
       LIMIT ${MAX_ITEMS};`
    )
  })

  const response = await queryDb(db, statements.join('\n'), params, { label: 'related post search' })
  // Exact results keep their relevance order; fuzzy results follow (closest
  // variant first), de-duplicated.
  const seen = new Set<string>()
  const rows: Array<{ id: unknown, slug?: unknown, title?: unknown }> = []
  statements.forEach((_, index) => {
    for (const row of queryRows<{ id: unknown, slug?: unknown, title?: unknown }>(response, index)) {
      const id = stringifyRecordId(row.id)
      if (!id || seen.has(id)) continue
      seen.add(id)
      rows.push(row)
    }
  })

  return { items: toItems(rows).slice(0, MAX_ITEMS) }
})

function toItems(rows: Array<{ id: unknown, slug?: unknown, title?: unknown }>) {
  return rows.map((row) => ({
    id: stringifyRecordId(row.id),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? '')
  })).filter((item) => item.slug)
}
