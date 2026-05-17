import { useDb } from '../../../utils/db'
import { normalizePost } from '../../../utils/content'
import { firstRow, queryRows } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'
import type { PostRecord, PostStatus } from '~/types/content'

const statuses: Array<PostStatus | 'all'> = ['all', 'draft', 'published', 'archived']

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const query = getQuery(event)
  const limit = Math.min(Number(query.limit ?? 20), 100)
  const start = Math.max(Number(query.start ?? 0), 0)
  const status = statuses.includes(query.status as PostStatus) ? query.status as PostStatus | 'all' : 'all'
  const where = status === 'all' ? 'status != "archived"' : 'status = $status'
  const db = await useDb()

  const response = await db.query(
    `SELECT * FROM post WHERE ${where} ORDER BY updated_at DESC LIMIT $limit START $start;
     SELECT count() AS total FROM post WHERE ${where} GROUP ALL;`,
    { status, limit, start }
  )

  const posts = queryRows<Record<string, unknown>>(response, 0).map(normalizePost)
  const count = firstRow<{ total?: number }>(response, 1)

  return {
    posts: posts satisfies PostRecord[],
    total: Number(count?.total ?? posts.length),
    limit,
    start
  }
})