import { useDb } from '../../utils/db'
import { normalizePost } from '../../utils/content'
import { firstRow, queryRows } from '../../utils/surrealResult'

export default defineCachedEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit ?? 20), 100)
  const start = Math.max(Number(query.start ?? 0), 0)
  const db = await useDb()
  const response = await db.query(
    `SELECT * FROM post WHERE status = "published" ORDER BY published_at DESC LIMIT $limit START $start;
     SELECT count() AS total FROM post WHERE status = "published" GROUP ALL;`,
    { limit, start }
  )
  const posts = queryRows<Record<string, unknown>>(response, 0).map(normalizePost)
  const count = firstRow<{ total?: number }>(response, 1)

  return {
    posts,
    total: Number(count?.total ?? posts.length),
    limit,
    start
  }
}, {
  maxAge: 60,
  swr: true,
  getKey: (event) => {
    const query = getQuery(event)
    return `posts:${query.limit ?? 20}:${query.start ?? 0}`
  }
})