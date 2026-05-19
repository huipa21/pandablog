import { queryDb, useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/auth'
import { recordIdPart } from '../../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'category')
  const db = await useDb()
  await queryDb(
    db,
    `DELETE categorized_as WHERE out = type::record($table, $id);
     DELETE type::record($table, $id);`,
    { table: 'category', id }
  )

  return { ok: true }
})
