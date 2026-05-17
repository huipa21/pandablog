import { useDb } from '../../utils/db'
import { normalizePost } from '../../utils/content'
import { firstRow } from '../../utils/surrealResult'

export default defineCachedEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Slug is required' })
  }

  const db = await useDb()
  const response = await db.query(
    'SELECT * FROM post WHERE slug = $slug AND status = "published" LIMIT 1;',
    { slug }
  )
  const post = firstRow<Record<string, unknown>>(response)

  if (!post) {
    throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  }

  return normalizePost(post)
}, {
  maxAge: 60,
  swr: true,
  getKey: (event) => `post:${getRouterParam(event, 'slug') ?? ''}`
})