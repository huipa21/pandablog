import { queryDb, useDb } from '../../utils/db'
import { requireAdminUser } from '../../utils/auth'
import { queryRows } from '../../utils/surrealResult'
import type { MediaRecord } from '~/types/content'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const db = await useDb()

  const query = getQuery(event)
  const page = parseInt(String(query.page || 1), 10)
  const limit = parseInt(String(query.limit || 20), 10)
  const search = String(query.search || '').trim()
  const type = String(query.type || 'all')

  const offset = (page - 1) * limit

  // Build query based on filters
  let whereClause = ''
  const params: Record<string, unknown> = { limit, offset }

  if (search) {
    whereClause = "WHERE original_name ~* $search"
    params.search = search
  }

  if (type === 'image') {
    whereClause = whereClause ? whereClause + " AND extension IN ['jpg', 'jpeg', 'png', 'gif', 'webp']" : "WHERE extension IN ['jpg', 'jpeg', 'png', 'gif', 'webp']"
  } else if (type === 'document') {
    whereClause = whereClause ? whereClause + " AND extension IN ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']" : "WHERE extension IN ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']"
  } else if (type === 'archive') {
    whereClause = whereClause ? whereClause + " AND extension IN ['zip']" : "WHERE extension IN ['zip']"
  }

  const countResponse = await queryDb(
    db,
    `SELECT count() as total FROM media ${whereClause};`,
    params
  )
  const total = ((countResponse[0] as any)?.[0]?.total as number) ?? 0

  const response = await queryDb(
    db,
    `SELECT * FROM media ${whereClause} ORDER BY created_at DESC LIMIT $limit START $offset;`,
    params
  )

  const files: MediaRecord[] = queryRows(response).map(normalizeMediaRecord)

  return {
    files,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  }
})

function normalizeMediaRecord(record: any): MediaRecord {
  return {
    id: record.id || '',
    original_name: String(record.original_name ?? ''),
    extension: String(record.extension ?? ''),
    mime_type: String(record.mime_type ?? ''),
    size: Number(record.size ?? 0),
    hash: String(record.hash ?? ''),
    path: String(record.path ?? ''),
    url: String(record.url ?? ''),
    width: record.width ?? null,
    height: record.height ?? null,
    thumbnail_path: record.thumbnail_path ?? null,
    perceptual_hash: record.perceptual_hash ?? null,
    created_at: String(record.created_at ?? '')
  }
}
