import type { H3Event } from 'h3'
import { queryDb, useDb } from './db'
import { firstRow, queryRows } from './surrealResult'

export type LogType = 'access' | 'activity' | 'errors'

export interface ListLogsResult {
  rows: Array<Record<string, unknown>>
  total: number
  limit: number
  offset: number
  sort: 'newest' | 'oldest'
}

interface LogListSpec {
  table: string
  label: string
  searchColumns: string[]
  setTypeWhere: (query: Record<string, unknown>, where: string[], params: Record<string, unknown>) => void
}

const logListSpecs: Record<LogType, LogListSpec> = {
  access: {
    table: 'access_logs',
    label: 'access',
    searchColumns: ['path', 'user_agent'],
    setTypeWhere(query, where, params) {
      setStringWhere(where, params, query.path, 'path = $path', 'path')

      if (typeof query.method === 'string' && query.method.trim()) {
        where.push('method = $method')
        params.method = query.method.trim().toUpperCase()
      }

      setNumericWhere(where, params, query.status, 'status_code = $status', 'status')
      setNumericWhere(where, params, query.min_status, 'status_code >= $min_status', 'min_status')
      setNumericWhere(where, params, query.max_status, 'status_code <= $max_status', 'max_status')
    }
  },
  activity: {
    table: 'activity_logs',
    label: 'activity',
    searchColumns: ['action', 'description'],
    setTypeWhere(query, where, params) {
      setStringWhere(where, params, query.action, 'action = $action', 'action')
      setStringWhere(where, params, query.resource_type, 'resource_type = $resource_type', 'resource_type')
      setStringWhere(where, params, query.resource_id, 'resource_id = $resource_id', 'resource_id')
    }
  },
  errors: {
    table: 'error_logs',
    label: 'error',
    searchColumns: ['message', 'stack'],
    setTypeWhere(query, where, params) {
      if (typeof query.level === 'string' && query.level.trim()) {
        where.push('level = $level')
        params.level = query.level.trim().toLowerCase()
      }
    }
  }
}

export function parseLogType(value: string): LogType {
  if (value === 'access' || value === 'activity' || value === 'errors') {
    return value
  }

  throw createError({ statusCode: 400, message: 'Invalid log type' })
}

export function parseLimit(value: unknown, fallback = 50, max = 200) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  return Math.min(Math.floor(parsed), max)
}

export function parseOffset(value: unknown) {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0
  }

  return Math.floor(parsed)
}

export function parseSort(value: unknown): 'newest' | 'oldest' {
  return value === 'oldest' ? 'oldest' : 'newest'
}

export function sanitizeSearchText(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .trim()
    .slice(0, 200)
}

export async function listLogs(event: H3Event, type: LogType): Promise<ListLogsResult> {
  const spec = logListSpecs[type]
  const query = getQuery(event)
  const limit = parseLimit(query.limit)
  const offset = parseOffset(query.offset)
  const sort = parseSort(query.sort)
  const orderBy = sort === 'oldest' ? 'ASC' : 'DESC'
  const params: Record<string, unknown> = { limit, offset }
  const where: string[] = []

  setDateWhere(where, params, query.from, query.to)
  spec.setTypeWhere(query, where, params)

  const search = sanitizeSearchText(query.search)
  if (search) {
    where.push(buildSearchWhere(spec.searchColumns))
    params.search = search
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT * FROM ${spec.table} ${whereSql} ORDER BY timestamp ${orderBy} LIMIT $limit START $offset;
     SELECT count() AS total FROM ${spec.table} ${whereSql} GROUP ALL;`,
    params,
    { label: `list ${spec.label} logs`, timeoutMs: 15_000 }
  )

  return {
    rows: queryRows<Record<string, unknown>>(response, 0),
    total: Number(firstRow<{ total?: number }>(response, 1)?.total ?? 0),
    limit,
    offset,
    sort
  }
}

export async function listAccessLogs(event: H3Event): Promise<ListLogsResult> {
  return await listLogs(event, 'access')
}

export async function listActivityLogs(event: H3Event): Promise<ListLogsResult> {
  return await listLogs(event, 'activity')
}

export async function listErrorLogs(event: H3Event): Promise<ListLogsResult> {
  return await listLogs(event, 'errors')
}

export function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) {
    return ''
  }

  const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))))
  const header = columns.join(',')
  const lines = rows.map((row) => columns.map((column) => escapeCsvCell(row[column])).join(','))

  return [header, ...lines].join('\n')
}

function escapeCsvCell(value: unknown) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  const escaped = raw.replaceAll('"', '""')

  return `"${escaped}"`
}

function buildSearchWhere(columns: string[]) {
  return `(${columns.map((column) => `string::lowercase(${column}) CONTAINS string::lowercase($search)`).join(' OR ')})`
}

function setStringWhere(where: string[], params: Record<string, unknown>, value: unknown, expression: string, paramName: string) {
  if (typeof value === 'string' && value.trim()) {
    where.push(expression)
    params[paramName] = value.trim()
  }
}

function setNumericWhere(where: string[], params: Record<string, unknown>, value: unknown, expression: string, paramName: string) {
  if (value === undefined) {
    return
  }

  const numberValue = Number(value)
  if (Number.isInteger(numberValue)) {
    where.push(expression)
    params[paramName] = numberValue
  }
}

function setDateWhere(where: string[], params: Record<string, unknown>, from: unknown, to: unknown) {
  if (typeof from === 'string' && isValidDate(from)) {
    where.push('timestamp >= <datetime>$from')
    params.from = from
  }

  if (typeof to === 'string' && isValidDate(to)) {
    where.push('timestamp <= <datetime>$to')
    params.to = to
  }
}

function isValidDate(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed)
}