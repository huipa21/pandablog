import { queryDb, queryDbRecord, useDb } from '../../../utils/db'
import { requireContentManager } from '../../../utils/auth'
import { recordIdPart } from '../../../utils/surrealResult'
import { assertCanManageOwnedRecord, assertNoOtherAuthorTaxonomyUsage } from '../../../utils/permissions'

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)

  const id = recordIdPart(getRouterParam(event, 'id') ?? '', 'tag')
  const db = await useDb()
  const existing = await queryDbRecord(db, 'tag', id)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Tag not found' })
  }
  assertCanManageOwnedRecord(user, existing, {
    ownerField: 'created_by',
    message: 'You can only delete tags you created'
  })
  await assertNoOtherAuthorTaxonomyUsage(db, user, 'tagged', 'tag', id)

  await queryDb(
    db,
    `DELETE tagged WHERE out = type::record($table, $id);
     DELETE type::record($table, $id);`,
    { table: 'tag', id }
  )

  return { ok: true }
})
