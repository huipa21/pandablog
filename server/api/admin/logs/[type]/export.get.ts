import { Readable } from 'node:stream'
import { requireSuperadmin } from '../../../../utils/auth'
import { csvChunks, listLogs, parseLogType, toCsv } from '../../../../utils/logging-admin'

export default defineEventHandler(async (event) => {
  await requireSuperadmin(event)

  const params = getRouterParams(event)
  if (!params.type) {
    throw createError({ statusCode: 400, message: 'Missing log type' })
  }

  const type = parseLogType(params.type)
  const query = getQuery(event)
  const format = query.format === 'csv' ? 'csv' : 'json'

  const result = await listLogs(event, type, type === 'access'
    ? { includeTotal: false, defaultLimit: 10_000, maxLimit: 10_000 }
    : {})

  const rows = result.rows.slice(0, 10_000)
  if (type === 'access') setHeader(event, 'x-log-truncated', String(Boolean(result.truncated)))

  if (format === 'csv') {
    setHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setHeader(event, 'content-disposition', `attachment; filename="${type}-logs.csv"`)
    return type === 'access' ? sendStream(event, Readable.from(csvChunks(rows))) : toCsv(rows)
  }

  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  if (type === 'access') {
    function* chunks() {
      yield `{"type":"access","exported":${rows.length},"truncated":${Boolean(result.truncated)},"rows":[`
      for (let index = 0; index < rows.length; index++) yield `${index ? ',' : ''}${JSON.stringify(rows[index])}`
      yield ']}'
    }
    return sendStream(event, Readable.from(chunks()))
  }
  return {
    type,
    exported: rows.length,
    rows
  }
})
