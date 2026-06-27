import type { GraphEdge, GraphNode, GraphPostResponse, GraphTaxonomyNode } from '~/types/graph'
import { queryDb, useDb } from '../../../utils/db'
import { addUndirectedLinkEdge, graphDegreeMap, graphRecordId, graphRecordIdPart, graphVisibilityFilterForEvent, isSyntheticGraphCategory, isSyntheticGraphTag } from '../../../utils/graph'
import { normalizeGraphPostRow, selectVisibleGraphPostsByIds, toGraphPostNode } from '../../../utils/graphQuery'
import { queryRows } from '../../../utils/surrealResult'

interface RelationRow {
  in?: unknown
  out?: unknown
}

interface TaxonomyRow {
  id: unknown
  slug?: unknown
  name?: unknown
}

const LOCAL_POST_LIMIT = 200

export default defineEventHandler(async (event): Promise<GraphPostResponse> => {
  if (!__PB_MODULE_GRAPH_VIEW__) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const slug = (getRouterParam(event, 'slug') ?? '').trim()
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Post slug is required' })
  }

  const visibility = await graphVisibilityFilterForEvent(event)
  const db = await useDb()
  const focusResponse = await queryDb(
    db,
    `SELECT id, slug, title, visibility
     FROM post
     WHERE slug = $slug
       AND ${visibility.where}
     LIMIT 1;`,
    { ...visibility.params, slug }
  )
  const focusRow = queryRows<Record<string, unknown>>(focusResponse, 0)[0]
  if (!focusRow?.id) {
    throw createError({ statusCode: 404, message: 'Post not found' })
  }

  const focus = normalizeGraphPostRow(focusRow)
  const focusIdPart = graphRecordIdPart(focus.id, 'post')
  const relationResponse = await queryDb(
    db,
    `SELECT in, out FROM links;
     SELECT out FROM categorized_as WHERE in = type::record('post', $focusId);
     SELECT out FROM tagged WHERE in = type::record('post', $focusId);`,
    { focusId: focusIdPart }
  )

  const linkRows = queryRows<RelationRow>(relationResponse, 0)
  const adjacency = buildAdjacency(linkRows)
  const firstHopCandidates = adjacency.get(focus.id) ?? new Set<string>()
  const firstHop = await selectVisibleGraphPostsByIds(db, firstHopCandidates, visibility, { limit: LOCAL_POST_LIMIT - 1 })
  const firstHopIds = new Set(firstHop.map((post) => post.id))

  const secondHopCandidates = new Set<string>()
  for (const post of firstHop) {
    for (const candidate of adjacency.get(post.id) ?? []) {
      if (candidate !== focus.id && !firstHopIds.has(candidate)) {
        secondHopCandidates.add(candidate)
      }
    }
  }

  const remaining = Math.max(0, LOCAL_POST_LIMIT - 1 - firstHop.length)
  const secondHop = remaining > 0
    ? await selectVisibleGraphPostsByIds(db, secondHopCandidates, visibility, { limit: remaining })
    : []

  const postRows = [focus, ...firstHop, ...secondHop]
  const postIds = new Set(postRows.map((post) => post.id))
  const linkEdges = new Map<string, GraphEdge>()
  for (const row of linkRows) {
    const source = graphRecordId(row.in)
    const target = graphRecordId(row.out)
    if (postIds.has(source) && postIds.has(target)) {
      addUndirectedLinkEdge(linkEdges, source, target)
    }
  }
  const degrees = graphDegreeMap(linkEdges.values())

  const categoryIds = queryRows<RelationRow>(relationResponse, 1).map((row) => graphRecordId(row.out))
  const tagIds = queryRows<RelationRow>(relationResponse, 2).map((row) => graphRecordId(row.out))
  const taxonomy = await loadFocusTaxonomy(db, categoryIds, tagIds)
  const primaryCategory = taxonomy.categories[0]?.slug ?? null

  const nodes: GraphNode[] = [
    ...postRows.map((post) => toGraphPostNode(post, degrees.get(post.id) ?? 0, primaryCategory)),
    ...taxonomy.categories,
    ...taxonomy.tags
  ]
  const taxonomyEdges: GraphEdge[] = [
    ...taxonomy.categories.map((category) => ({ id: `categorized:${focus.id}__${category.id}`, source: focus.id, target: category.id, type: 'categorized' as const })),
    ...taxonomy.tags.map((tag) => ({ id: `tagged:${focus.id}__${tag.id}`, source: focus.id, target: tag.id, type: 'tagged' as const }))
  ]

  return {
    focus: focus.id,
    cluster: primaryCategory,
    nodes,
    edges: [...linkEdges.values(), ...taxonomyEdges],
    viewerScope: visibility.viewerScope
  }
})

function buildAdjacency(rows: RelationRow[]) {
  const adjacency = new Map<string, Set<string>>()
  for (const row of rows) {
    const source = graphRecordId(row.in)
    const target = graphRecordId(row.out)
    if (!source || !target || source === target) {
      continue
    }
    addAdjacency(adjacency, source, target)
    addAdjacency(adjacency, target, source)
  }
  return adjacency
}

function addAdjacency(adjacency: Map<string, Set<string>>, source: string, target: string) {
  const existing = adjacency.get(source) ?? new Set<string>()
  existing.add(target)
  adjacency.set(source, existing)
}

async function loadFocusTaxonomy(db: Awaited<ReturnType<typeof useDb>>, categoryIds: string[], tagIds: string[]) {
  const categories = await loadTaxonomyNodes(db, 'category', categoryIds)
  const tags = await loadTaxonomyNodes(db, 'tag', tagIds)
  return { categories, tags }
}

async function loadTaxonomyNodes(db: Awaited<ReturnType<typeof useDb>>, table: 'category' | 'tag', ids: string[]): Promise<GraphTaxonomyNode[]> {
  const uniqueIds = [...new Set(ids.map((id) => graphRecordIdPart(id, table)).filter(Boolean))]
  if (!uniqueIds.length) {
    return []
  }

  const params: Record<string, unknown> = {}
  const clauses = uniqueIds.map((id, index) => {
    const key = `${table}Id_${index}`
    params[key] = id
    return `id = type::record('${table}', $${key})`
  })
  const response = await queryDb(
    db,
    `SELECT id, slug, name FROM ${table} WHERE ${clauses.join(' OR ')};`,
    params
  )

  return queryRows<TaxonomyRow>(response, 0)
    .map((row) => ({
      id: graphRecordId(row.id),
      type: table,
      slug: String(row.slug ?? ''),
      name: String(row.name ?? ''),
      postCount: null
    }))
    .filter((node) => table === 'category'
      ? !isSyntheticGraphCategory(node.slug, node.name)
      : !isSyntheticGraphTag(node.slug, node.name))
}