import { queryDb, useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/auth'
import { firstRow, recordIdPart } from '../../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'category')
  const db = await useDb()
  const categoryResponse = await queryDb(db, 'SELECT slug FROM type::record($table, $id) LIMIT 1;', { table: 'category', id })
  const category = firstRow<{ slug?: string }>(categoryResponse)

  if (category?.slug === 'default') {
    throw createError({ statusCode: 400, message: 'Default category cannot be deleted' })
  }

  const childResponse = await queryDb(
    db,
    'SELECT id FROM category WHERE parent = type::record($table, $id) LIMIT 1;',
    { table: 'category', id }
  )

  if (firstRow(childResponse)) {
    throw createError({ statusCode: 400, message: 'Move or delete child categories first' })
  }

  await queryDb(
    db,
    `DELETE categorized_as WHERE out = type::record($table, $id);
     DELETE type::record($table, $id);`,
    { table: 'category', id }
  )

  return { ok: true }
})
