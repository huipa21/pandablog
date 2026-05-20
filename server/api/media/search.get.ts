import { requireAdminUser } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { mediaSearchFileRecords } from '../../utils/mediaLibrary'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const query = getQuery(event)
  const db = await useDb()

  return await mediaSearchFileRecords(db, {
    page: Number(query.page || 1),
    limit: Number(query.limit || 24),
    search: stringQuery(query.search),
    type: stringQuery(query.type) || 'all',
    mime_type: stringQuery(query.mime_type),
    folder: stringQuery(query.folder),
    tag: stringQuery(query.tag),
    uploaded_from: stringQuery(query.uploaded_from),
    uploaded_to: stringQuery(query.uploaded_to),
    orphan: query.orphan === 'true'
  })
})

function stringQuery(value: unknown) {
  return typeof value === 'string' ? value : ''
}
