import { useDb } from '../../utils/db'
import { normalizePost } from '../../utils/content'
import { firstRow, queryRows } from '../../utils/surrealResult'
import { normalizeConcept } from '../../utils/wikiLinks'

export default defineCachedEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Slug is required' })
  }

  const db = await useDb()
  const response = await db.query(
    `SELECT * FROM concept WHERE slug = $slug LIMIT 1;
     SELECT * FROM post WHERE status = "published" AND ->mentions->concept.slug CONTAINS $slug ORDER BY published_at DESC;`,
    { slug }
  )
  const concept = firstRow<Record<string, unknown>>(response, 0)

  if (!concept) {
    throw createError({ statusCode: 404, statusMessage: 'Concept not found' })
  }

  return {
    concept: normalizeConcept(concept),
    posts: queryRows<Record<string, unknown>>(response, 1).map(normalizePost)
  }
}, {
  maxAge: 60,
  swr: true,
  getKey: (event) => `concept:${getRouterParam(event, 'slug') ?? ''}`
})