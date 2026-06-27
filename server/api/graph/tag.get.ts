import type { GraphEdge, GraphTagResponse } from '~/types/graph'
import { queryDb, useDb } from '../../utils/db'
import { addUndirectedLinkEdge, graphDegreeMap, graphRecordId, graphRecordIdPart, graphVisibilityFilterForEvent, isSyntheticGraphTag } from '../../utils/graph'
import { selectVisibleGraphPostsByIds, toGraphPostNode } from '../../utils/graphQuery'
import { queryRows } from '../../utils/surrealResult'

interface TagRow {
  id: unknown
  slug?: unknown
  name?: unknown
}

interface RelationRow {
  in?: unknown
  out?: unknown
}

const DEFAULT_LIMIT = 180
const MAX_LIMIT = 240

export default defineEventHandler(async (event): Promise<GraphTagResponse> => {
  if (!__PB_MODULE_GRAPH_VIEW__) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const query = getQuery(event)
  const slug = typeof query.tag === 'string' ? query.tag.trim() : ''
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Tag slug is required' })
  }
  if (isSyntheticGraphTag(slug)) {
    throw createError({ statusCode: 404, message: 'Tag not found' })
  }

  const requestedLimit = Number(query.limit ?? DEFAULT_LIMIT)
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIMIT, MAX_LIMIT))
  const visibility = await graphVisibilityFilterForEvent(event)
  const db = await useDb()

  const tagResponse = await queryDb(
    db,
    'SELECT id, slug, name FROM tag WHERE slug = $slug LIMIT 1;',
    { slug }
  )
  const tagRow = queryRows<TagRow>(tagResponse, 0)[0]
  if (!tagRow?.id) {
    throw createError({ statusCode: 404, message: 'Tag not found' })
  }

  const tag = {
    id: graphRecordId(tagRow.id),
    slug: String(tagRow.slug ?? ''),
    name: String(tagRow.name ?? '')
  }
  if (isSyntheticGraphTag(tag.slug, tag.name)) {
    throw createError({ statusCode: 404, message: 'Tag not found' })
  }

  const tagId = graphRecordIdPart(tag.id, 'tag')
  const relationResponse = await queryDb(
    db,
    `SELECT in FROM tagged WHERE out = type::record('tag', $tagId);
     SELECT in, out FROM links;`,
    { tagId }
  )

  const candidateIds = queryRows<RelationRow>(relationResponse, 0).map((row) => graphRecordId(row.in))
  const posts = await selectVisibleGraphPostsByIds(db, candidateIds, visibility, { limit: limit + 1 })
  const truncated = posts.length > limit
  const selectedPosts = posts.slice(0, limit)
  const selectedPostIds = new Set(selectedPosts.map((post) => post.id))

  const edges = new Map<string, GraphEdge>()
  for (const row of queryRows<RelationRow>(relationResponse, 1)) {
    const source = graphRecordId(row.in)
    const target = graphRecordId(row.out)
    if (selectedPostIds.has(source) && selectedPostIds.has(target)) {
      addUndirectedLinkEdge(edges, source, target)
    }
  }
  const degrees = graphDegreeMap(edges.values())
  const nodes = selectedPosts.map((post) => toGraphPostNode(post, degrees.get(post.id) ?? 0, null))

  return {
    tag,
    nodes,
    edges: [...edges.values()],
    truncated,
    limit,
    viewerScope: visibility.viewerScope
  }
})