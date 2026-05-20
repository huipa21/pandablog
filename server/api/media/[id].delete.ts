import { requireAdminUser } from '../../utils/auth'
import { queryDb, useDb } from '../../utils/db'
import { mediaDeleteStoredObjects } from '../../utils/fileStorage'
import { mediaNormalizeFileRecord, mediaNormalizeHash } from '../../utils/mediaLibrary'
import { firstRow } from '../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const id = mediaNormalizeHash(getRouterParam(event, 'id') ?? '')
  const force = getQuery(event).force === 'true'
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM type::record($table, $id) LIMIT 1;', {
    table: 'files',
    id
  })
  const record = firstRow<Record<string, unknown>>(response)

  if (!record) {
    throw createError({ statusCode: 404, message: 'Media file not found' })
  }

  const file = mediaNormalizeFileRecord(record)

  if (!force && (file.reference_count ?? 0) > 0) {
    throw createError({ statusCode: 409, message: 'File is still referenced. Remove references or force delete.' })
  }

  await mediaDeleteStoredObjects(file)
  await queryDb(db, 'DELETE FROM type::record($table, $id);', {
    table: 'files',
    id
  })

  return { success: true }
})
