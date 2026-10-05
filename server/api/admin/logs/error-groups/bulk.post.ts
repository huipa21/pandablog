import { requireSuperadmin } from '../../../../utils/auth'
import { assertLogTypeEnabled } from '../../../../utils/logging-admin'
import { bulkErrorGroupsSchema, bulkErrorGroups } from '../../../../utils/error-groups'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  assertLogTypeEnabled('errors')
  const parsed = bulkErrorGroupsSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Invalid bulk error group action' })
  return bulkErrorGroups(parsed.data)
})
