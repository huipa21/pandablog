import { queryDb, useDb } from '../../utils/db'
import { normalizeTag } from '../../utils/taxonomy'
import { queryRows, stringifyRecordId } from '../../utils/surrealResult'
import type { TagRecord } from '~/types/content'

export default defineEventHandler(async () => {
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT * FROM tag ORDER BY name ASC;
     SELECT out, count() AS total FROM tagged GROUP BY out;`
  )
  const counts = new Map(queryRows<Record<string, unknown>>(response, 1).map((row) => [stringifyRecordId(row.out), Number(row.total ?? 0)]))
  const tags = queryRows<Record<string, unknown>>(response, 0).map((tag) => normalizeTag({
    ...tag,
    post_count: counts.get(stringifyRecordId(tag.id)) ?? 0
  }))

  return { tags: tags satisfies TagRecord[] }
})
