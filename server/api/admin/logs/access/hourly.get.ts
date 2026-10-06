import { requireSuperadmin } from '../../../../utils/auth'
import { requestAbortSignal } from '../../../../utils/request-abort'
import { accessHourly } from '../../../../utils/access-log-reader'
import { assertLogTypeEnabled } from '../../../../utils/logging-admin'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)
  assertLogTypeEnabled('access')
  // Fixed dashboard window: 24 UTC buckets, including the current partial hour.
  return await accessHourly(24, new Date(), requestAbortSignal(event))
})
