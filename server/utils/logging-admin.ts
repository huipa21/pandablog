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

export async function listAccessLogs(event: H3Event): Promise<ListLogsResult> {
  const query = getQuery(event)
  const limit = parseLimit(query.limit)
  const offset = parseOffset(query.offset)
  const sort = parseSort(query.sort)
  const orderBy = sort === 'oldest' ? 'ASC' : 'DESC'
  const params: Record<string, unknown> = { limit, offset }
  const where: string[] = []

  setDateWhere(where, params, query.from, query.to)

  if (typeof query.path === 'string' && query.path.trim()) {
    where.push('path = $path')
    params.path = query.path.trim()
  }

  if (typeof query.method === 'string' && query.method.trim()) {
    where.push('method = $method')
    params.method = query.method.trim().toUpperCase()
  }

  if (query.status !== undefined) {
    const status = Number(query.status)
    if (Number.isInteger(status)) {
      where.push('status_code = $status')
      params.status = status
    }
  }

  if (query.min_status !== undefined) {
    const minStatus = Number(query.min_status)
    if (Number.isInteger(minStatus)) {
      where.push('status_code >= $min_status')
      params.min_status = minStatus
    }
  }

  if (query.max_status !== undefined) {
    const maxStatus = Number(query.max_status)
    if (Number.isInteger(maxStatus)) {
      where.push('status_code <= $max_status')
      params.max_status = maxStatus
    }
  }

  const search = sanitizeSearchText(query.search)
  if (search) {
    where.push('(string::lowercase(path) CONTAINS string::lowercase($search) OR string::lowercase(user_agent) CONTAINS string::lowercase($search))')
    params.search = search
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT * FROM access_logs ${whereSql} ORDER BY timestamp ${orderBy} LIMIT $limit START $offset;
     SELECT count() AS total FROM access_logs ${whereSql} GROUP ALL;`,
    params,
    { label: 'list access logs', timeoutMs: 15_000 }
  )

  return {
    rows: queryRows<Record<string, unknown>>(response, 0),
    total: Number(firstRow<{ total?: number }>(response, 1)?.total ?? 0),
    limit,
    offset,
    sort
  }
}

export async function listActivityLogs(event: H3Event): Promise<ListLogsResult> {
  const query = getQuery(event)
  const limit = parseLimit(query.limit)
  const offset = parseOffset(query.offset)
  const sort = parseSort(query.sort)
  const orderBy = sort === 'oldest' ? 'ASC' : 'DESC'
  const params: Record<string, unknown> = { limit, offset }
  const where: string[] = []

  setDateWhere(where, params, query.from, query.to)

  if (typeof query.action === 'string' && query.action.trim()) {
    where.push('action = $action')
    params.action = query.action.trim()
  }

  if (typeof query.resource_type === 'string' && query.resource_type.trim()) {
    where.push('resource_type = $resource_type')
    params.resource_type = query.resource_type.trim()
  }

  if (typeof query.resource_id === 'string' && query.resource_id.trim()) {
    where.push('resource_id = $resource_id')
    params.resource_id = query.resource_id.trim()
  }

  const search = sanitizeSearchText(query.search)
  if (search) {
    where.push('(string::lowercase(action) CONTAINS string::lowercase($search) OR string::lowercase(description) CONTAINS string::lowercase($search))')
    params.search = search
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT * FROM activity_logs ${whereSql} ORDER BY timestamp ${orderBy} LIMIT $limit START $offset;
     SELECT count() AS total FROM activity_logs ${whereSql} GROUP ALL;`,
    params,
    { label: 'list activity logs', timeoutMs: 15_000 }
  )

  return {
    rows: queryRows<Record<string, unknown>>(response, 0),
    total: Number(firstRow<{ total?: number }>(response, 1)?.total ?? 0),
    limit,
    offset,
    sort
  }
}

export async function listErrorLogs(event: H3Event): Promise<ListLogsResult> {
  const query = getQuery(event)
  const limit = parseLimit(query.limit)
  const offset = parseOffset(query.offset)
  const sort = parseSort(query.sort)
  const orderBy = sort === 'oldest' ? 'ASC' : 'DESC'
  const params: Record<string, unknown> = { limit, offset }
  const where: string[] = []

  setDateWhere(where, params, query.from, query.to)

  if (typeof query.level === 'string' && query.level.trim()) {
    where.push('level = $level')
    params.level = query.level.trim().toLowerCase()
  }

  const search = sanitizeSearchText(query.search)
  if (search) {
    where.push('(string::lowercase(message) CONTAINS string::lowercase($search) OR string::lowercase(stack) CONTAINS string::lowercase($search))')
    params.search = search
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT * FROM error_logs ${whereSql} ORDER BY timestamp ${orderBy} LIMIT $limit START $offset;
     SELECT count() AS total FROM error_logs ${whereSql} GROUP ALL;`,
    params,
    { label: 'list error logs', timeoutMs: 15_000 }
  )

  return {
    rows: queryRows<Record<string, unknown>>(response, 0),
    total: Number(firstRow<{ total?: number }>(response, 1)?.total ?? 0),
    limit,
    offset,
    sort
  }
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
