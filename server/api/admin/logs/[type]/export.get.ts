import { requireSuperadmin } from '../../../../utils/auth'
import { listAccessLogs, listActivityLogs, listErrorLogs, parseLogType, toCsv } from '../../../../utils/logging-admin'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)

  const params = getRouterParams(event)
  if (!params.type) {
    throw createError({ statusCode: 400, message: 'Missing log type' })
  }

  const type = parseLogType(params.type)
  const query = getQuery(event)
  const format = query.format === 'csv' ? 'csv' : 'json'

  let result
  if (type === 'access') {
    result = await listAccessLogs(event)
  } else if (type === 'activity') {
    result = await listActivityLogs(event)
  } else {
    result = await listErrorLogs(event)
  }

  const rows = result.rows.slice(0, 10_000)

  if (format === 'csv') {
    setHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setHeader(event, 'content-disposition', `attachment; filename="${type}-logs.csv"`)
    return toCsv(rows)
  }

  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  return {
    type,
    exported: rows.length,
    rows
  }
})
