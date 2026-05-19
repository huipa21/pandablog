import { queryDb, useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/auth'
import { firstRow } from '../../../utils/surrealResult'
import { normalizeCategory, taxonomyName, uniqueTaxonomySlug } from '../../../utils/taxonomy'
import { stringOrNull } from '../../../utils/content'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const body = await readBody<Record<string, unknown>>(event)
  const name = taxonomyName(body.name)
  const db = await useDb()
  const slug = await uniqueTaxonomySlug(db, 'category', String(body.slug || name))
  const description = stringOrNull(body.description)
  const category: Record<string, unknown> = { name, slug }

  if (description) {
    category.description = description
  }

  const response = await queryDb(db, 'CREATE category CONTENT $category;', { category })
  const created = firstRow<Record<string, unknown>>(response)

  if (!created) {
    throw createError({ statusCode: 500, message: 'Category was not created' })
  }

  return normalizeCategory(created)
})
