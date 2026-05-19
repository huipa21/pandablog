import { queryDb, useDb } from '../../utils/db'
import { normalizeCategory } from '../../utils/taxonomy'
import { queryRows, stringifyRecordId } from '../../utils/surrealResult'
import type { CategoryRecord } from '~/types/content'

export default defineEventHandler(async () => {
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT * FROM category ORDER BY name ASC;
     SELECT out, count() AS total FROM categorized_as GROUP BY out;`
  )
  const counts = new Map(queryRows<Record<string, unknown>>(response, 1).map((row) => [stringifyRecordId(row.out), Number(row.total ?? 0)]))
  const categories = queryRows<Record<string, unknown>>(response, 0).map((category) => normalizeCategory({
    ...category,
    post_count: counts.get(stringifyRecordId(category.id)) ?? 0
  }))

  return { categories: categories satisfies CategoryRecord[] }
})
