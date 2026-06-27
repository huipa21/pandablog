import type { GraphClusterResponse, GraphEdge } from '~/types/graph'
import { queryDb, useDb } from '../../utils/db'
import { addUndirectedLinkEdge, graphDegreeMap, graphRecordId, graphRecordIdPart, graphVisibilityFilterForEvent, isSyntheticGraphCategory } from '../../utils/graph'
import { selectVisibleGraphPostsByIds, toGraphPostNode } from '../../utils/graphQuery'
import { queryRows } from '../../utils/surrealResult'

interface CategoryRow {
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

export default defineEventHandler(async (event): Promise<GraphClusterResponse> => {
  if (!__PB_MODULE_GRAPH_VIEW__) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const query = getQuery(event)
  const slug = typeof query.category === 'string' ? query.category.trim() : ''
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Category slug is required' })
  }
  if (isSyntheticGraphCategory(slug)) {
    throw createError({ statusCode: 404, message: 'Category not found' })
  }

  const requestedLimit = Number(query.limit ?? DEFAULT_LIMIT)
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIMIT, MAX_LIMIT))
  const visibility = await graphVisibilityFilterForEvent(event)
  const db = await useDb()

  const categoryResponse = await queryDb(
    db,
    'SELECT id, slug, name FROM category WHERE slug = $slug LIMIT 1;',
    { slug }
  )
  const categoryRow = queryRows<CategoryRow>(categoryResponse, 0)[0]
  if (!categoryRow?.id) {
    throw createError({ statusCode: 404, message: 'Category not found' })
  }

  const category = {
    id: graphRecordId(categoryRow.id),
    slug: String(categoryRow.slug ?? ''),
    name: String(categoryRow.name ?? '')
  }
  if (isSyntheticGraphCategory(category.slug, category.name)) {
    throw createError({ statusCode: 404, message: 'Category not found' })
  }
  const categoryId = graphRecordIdPart(category.id, 'category')
  const relationResponse = await queryDb(
    db,
    `SELECT in FROM categorized_as WHERE out = type::record('category', $categoryId);
     SELECT in, out FROM links;`,
    { categoryId }
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
  const nodes = selectedPosts.map((post) => toGraphPostNode(post, degrees.get(post.id) ?? 0, category.slug))

  return {
    category,
    nodes,
    edges: [...edges.values()],
    truncated,
    limit,
    viewerScope: visibility.viewerScope
  }
})

