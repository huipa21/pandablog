import { queryDb, queryDbRecord, useDb } from '../../../utils/db'
import { requireContentManager } from '../../../utils/auth'
import { firstRow, recordIdPart } from '../../../utils/surrealResult'
import { assertCanManageOwnedRecord } from '../../../utils/permissions'
import { normalizeTag, taxonomyName, uniqueTaxonomySlug } from '../../../utils/taxonomy'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'tag')
  const body = await readBody<Record<string, unknown>>(event)
  const name = taxonomyName(body.name)
  const db = await useDb()
  const existing = await queryDbRecord(db, 'tag', id)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Tag not found' })
  }
  assertCanManageOwnedRecord(user, existing, {
    ownerField: 'created_by',
    message: 'You can only edit tags you created'
  })

  const slug = await uniqueTaxonomySlug(db, 'tag', String(body.slug || name), `tag:${id}`)

  const response = await queryDb(
    db,
    'UPDATE type::record($table, $id) MERGE $tag;',
    { table: 'tag', id, tag: { name, slug } }
  )
  const updated = firstRow<Record<string, unknown>>(response)

  if (!updated) {
    throw createError({ statusCode: 404, message: 'Tag not found' })
  }

  return normalizeTag(updated)
})
