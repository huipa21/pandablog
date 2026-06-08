import { requireContentManager } from '../../utils/auth'
import { queryDb, queryDbRecord, useDb } from '../../utils/db'
import { mediaDeleteStoredObjects } from '../../utils/fileStorage'
import { mediaNormalizeFileRecord, mediaNormalizeHash } from '../../utils/mediaLibrary'
import { mediaRecordManageableByUser } from '../../utils/mediaPermissions'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)
  const id = mediaNormalizeHash(getRouterParam(event, 'id') ?? '')
  const force = getQuery(event).force === 'true'
  const db = await useDb()
  const record = await queryDbRecord(db, 'files', id)

  if (!record) {
    throw createError({ statusCode: 404, message: 'Media file not found' })
  }

  const file = mediaNormalizeFileRecord(record)
  if (!mediaRecordManageableByUser(file, user)) {
    throw createError({ statusCode: 403, message: 'You can only delete media you uploaded' })
  }

  if (!force && (file.reference_count ?? 0) > 0) {
    throw createError({ statusCode: 409, message: 'File is still referenced. Remove references or force delete.' })
  }

  await mediaDeleteStoredObjects(file)
  await queryDb(db, 'DELETE FROM type::record($table, $id);', {
    table: 'files',
    id
  })
  await queryDb(db, 'UPDATE users SET avatar = NONE, updated_at = time::now() WHERE avatar = type::record($table, $id);', {
    table: 'files',
    id
  })

  return { success: true }
})
