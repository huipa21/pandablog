import { queryDb, useDb } from '../../../utils/db'
import { normalizePost } from '../../../utils/content'
import { queryRows } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'
import { conceptRows } from '../../../utils/wikiLinks'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const search = String(getQuery(event).q ?? '').trim().toLowerCase()
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT * FROM concept ORDER BY name ASC LIMIT 50;
     SELECT id, title, slug, status, content_json, content_text, author_username, created_at, updated_at, view_count FROM post WHERE status != "archived" ORDER BY updated_at DESC LIMIT 50;`
  )
  const concepts = conceptRows(response, 0)
  const posts = queryRows<Record<string, unknown>>(response, 1).map(normalizePost)
  const matches = (value: string) => !search || value.toLowerCase().includes(search)

  return {
    items: [
      ...concepts
        .filter((concept) => matches(concept.name) || matches(concept.slug))
        .map((concept) => ({
          type: 'concept',
          label: concept.name,
          target: concept.slug,
          href: `/concept/${concept.slug}`
        })),
      ...posts
        .filter((post) => matches(post.title) || matches(post.slug))
        .map((post) => ({
          type: 'post',
          label: post.title,
          target: post.slug,
          href: `/blog/${post.slug}`
        }))
    ].slice(0, 20)
  }
})