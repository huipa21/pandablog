import { requireAdminUser } from '../../utils/auth'
import { queryDb, useDb } from '../../utils/db'
import { mediaNormalizeFileRecord, mediaNormalizeHash } from '../../utils/mediaLibrary'
import { firstRow } from '../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const id = mediaNormalizeHash(getRouterParam(event, 'id') ?? '')
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: 'files',
    id
  })
  const record = firstRow<Record<string, unknown>>(response)

  if (!record) {
    throw createError({ statusCode: 404, message: 'Media file not found' })
  }

  return mediaNormalizeFileRecord(record)
})
