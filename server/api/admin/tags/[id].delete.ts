import { queryDb, useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/auth'
import { recordIdPart } from '../../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'tag')
  const db = await useDb()
  await queryDb(
    db,
    `DELETE tagged WHERE out = type::record($table, $id);
     DELETE type::record($table, $id);`,
    { table: 'tag', id }
  )

  return { ok: true }
})
