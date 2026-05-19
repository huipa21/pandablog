import { queryDb, useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/auth'
import { firstRow, recordIdPart } from '../../../utils/surrealResult'
import { normalizeCategory, taxonomyName, uniqueTaxonomySlug } from '../../../utils/taxonomy'
import { stringOrNull } from '../../../utils/content'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'category')
  const body = await readBody<Record<string, unknown>>(event)
  const name = taxonomyName(body.name)
  const db = await useDb()
  const slug = await uniqueTaxonomySlug(db, 'category', String(body.slug || name), `category:${id}`)
  const description = stringOrNull(body.description)
  const clears = description ? '' : 'SET description = NONE'

  const response = await queryDb(
    db,
    `UPDATE type::record($table, $id) MERGE $category ${clears};`,
    {
      table: 'category',
      id,
      category: description ? { name, slug, description } : { name, slug }
    }
  )
  const updated = firstRow<Record<string, unknown>>(response)

  if (!updated) {
    throw createError({ statusCode: 404, message: 'Category not found' })
  }

  return normalizeCategory(updated)
})
