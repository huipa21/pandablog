import { queryDb, useDb } from '../../../utils/db'
import { requireContentManager } from '../../../utils/auth'
import { normalizeCategory } from '../../../utils/taxonomy'
import { queryRows, stringifyRecordId } from '../../../utils/surrealResult'
import type { CategoryRecord } from '~/types/content'

export default defineEventHandler(async (event) => {
  await requireContentManager(event)

  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT * FROM category ORDER BY name ASC;
     SELECT out, count() AS total FROM categorized_as GROUP BY out;`
  )
  const counts = countMap(queryRows<Record<string, unknown>>(response, 1))
  const categories = queryRows<Record<string, unknown>>(response, 0).map((category) => normalizeCategory({
    ...category,
    post_count: counts.get(stringifyRecordId(category.id)) ?? 0
  }))

  return { categories: categories satisfies CategoryRecord[] }
})

function countMap(rows: Array<Record<string, unknown>>) {
  return new Map(rows.map((row) => [stringifyRecordId(row.out), Number(row.total ?? 0)]))
}
