import type { Surreal } from 'surrealdb'
import type { GraphPostNode } from '~/types/graph'
import { queryDb } from './db'
import { queryRows } from './surrealResult'
import { graphPostVisibility, graphRecordId, graphRecordIdPart, type GraphVisibilityFilter } from './graph'

export interface GraphPostRow {
  id: string
  idPart: string
  slug: string
  title: string
  visibility: 'public' | 'private'
}

export function normalizeGraphPostRow(row: Record<string, unknown>): GraphPostRow {
  const id = graphRecordId(row.id)
  return {
    id,
    idPart: graphRecordIdPart(id, 'post'),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? ''),
    visibility: graphPostVisibility(row.visibility)
  }
}

export function toGraphPostNode(row: GraphPostRow, degree: number, category: string | null): GraphPostNode {
  return {
    id: row.id,
    type: 'post',
    slug: row.slug,
    title: row.title,
    degree,
    category,
    visibility: row.visibility
  }
}

export async function selectVisibleGraphPostsByIds(
  db: Surreal,
  ids: Iterable<string>,
  visibility: GraphVisibilityFilter,
  options: { limit?: number } = {}
) {
  const uniqueIds = [...new Set([...ids].map((id) => graphRecordIdPart(id, 'post')).filter(Boolean))]
  if (!uniqueIds.length) {
    return [] as GraphPostRow[]
  }

  const limit = Math.max(1, Math.min(Number(options.limit ?? uniqueIds.length), uniqueIds.length))
  const params: Record<string, unknown> = { ...visibility.params }
  const clauses = uniqueIds.map((id, index) => {
    const key = `postId_${index}`
    params[key] = id
    return `id = type::record('post', $${key})`
  })

  const response = await queryDb(
    db,
    `SELECT id, slug, title, visibility, published_at, created_at
     FROM post
     WHERE (${clauses.join(' OR ')})
       AND ${visibility.where}
     ORDER BY published_at DESC, created_at DESC
     LIMIT ${limit};`,
    params
  )

  return queryRows<Record<string, unknown>>(response, 0).map(normalizeGraphPostRow)
}