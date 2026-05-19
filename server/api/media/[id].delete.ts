import { queryDb, useDb } from '../../utils/db'
import { requireAdminUser } from '../../utils/auth'
import { deleteStorageFile, deleteThumbnail } from '../../utils/storage'
import { recordIdPart } from '../../utils/surrealResult'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const db = await useDb()
  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'media')

  // Fetch the media record
  const response = await queryDb(
    db,
    'SELECT * FROM type::record($table, $id) LIMIT 1;',
    { table: 'media', id }
  )

  const record = (response[0] as any)?.[0]
  if (!record) {
    throw createError({ statusCode: 404, message: 'Media file not found' })
  }

  // Delete from storage
  try {
    if (record.path) {
      await deleteStorageFile(record.path)
    }
    if (record.thumbnail_path) {
      await deleteThumbnail(record.thumbnail_path)
    }
  } catch (error) {
    console.error('Error deleting storage files:', error)
    // Continue with DB deletion even if storage deletion fails
  }

  // Delete from database
  await queryDb(
    db,
    'DELETE FROM type::record($table, $id);',
    { table: 'media', id }
  )

  return { success: true }
})
