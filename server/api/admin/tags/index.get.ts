import { queryDb, useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/auth'
import { normalizeTag } from '../../../utils/taxonomy'
import { queryRows, stringifyRecordId } from '../../../utils/surrealResult'
import type { TagRecord } from '~/types/content'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const db = await useDb()
  const baseResponse = await queryDb(
    db,
    `SELECT * FROM tag ORDER BY name ASC;
     SELECT out, count() AS total FROM tagged GROUP BY out;`
  )
  const postCounts = new Map(queryRows<Record<string, unknown>>(baseResponse, 1).map((row) => [stringifyRecordId(row.out), Number(row.total ?? 0)]))

  const tags = queryRows<Record<string, unknown>>(baseResponse, 0).map((tag) => {
    const tagId = stringifyRecordId(tag.id)
    return normalizeTag({
      ...tag,
      post_count: postCounts.get(tagId) ?? 0
    })
  })

  return { tags: tags satisfies TagRecord[] }
})
