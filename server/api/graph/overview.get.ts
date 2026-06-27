import type { GraphClusterAggregate, GraphEdge, GraphNode, GraphOverviewResponse } from '~/types/graph'
import { queryDb, useDb } from '../../utils/db'
import { addUndirectedLinkEdge, graphDegreeMap, graphRecordId, graphVisibilityFilterForEvent } from '../../utils/graph'
import { normalizeGraphPostRow, toGraphPostNode } from '../../utils/graphQuery'
import { queryRows } from '../../utils/surrealResult'

interface TaxonomyRow {
  id: unknown
  slug?: unknown
  name?: unknown
}

interface RelationRow {
  in?: unknown
  out?: unknown
}

export default defineEventHandler(async (event): Promise<GraphOverviewResponse> => {
  if (!__PB_MODULE_GRAPH_VIEW__) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const visibility = await graphVisibilityFilterForEvent(event)
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT id, slug, title, visibility FROM post WHERE ${visibility.where};
     SELECT id, slug, name FROM category;
     SELECT id, slug, name FROM tag;
     SELECT in, out FROM categorized_as;
     SELECT in, out FROM tagged;
     SELECT in, out FROM links;`,
    visibility.params
  )

  const posts = queryRows<Record<string, unknown>>(response, 0).map(normalizeGraphPostRow)
  const visiblePostIds = new Set(posts.map((post) => post.id))
  const categories = queryRows<TaxonomyRow>(response, 1)
    .map((row) => ({ id: graphRecordId(row.id), type: 'category' as const, slug: String(row.slug ?? ''), name: String(row.name ?? '') }))
    .filter((category) => category.slug && category.name && !isSyntheticCategory(category.slug, category.name))
  const tags = queryRows<TaxonomyRow>(response, 2)
    .map((row) => ({ id: graphRecordId(row.id), type: 'tag' as const, slug: String(row.slug ?? ''), name: String(row.name ?? '') }))
    .filter((tag) => tag.slug && tag.name && !isSyntheticTag(tag.slug, tag.name))
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const tagById = new Map(tags.map((tag) => [tag.id, tag]))

  const postCategoryIds = new Map<string, Set<string>>()
  for (const row of queryRows<RelationRow>(response, 3)) {
    const postId = graphRecordId(row.in)
    const categoryId = graphRecordId(row.out)
    if (!visiblePostIds.has(postId) || !categoryById.has(categoryId)) {
      continue
    }
    const existing = postCategoryIds.get(postId) ?? new Set<string>()
    existing.add(categoryId)
    postCategoryIds.set(postId, existing)
  }

  const postTagIds = new Map<string, Set<string>>()
  for (const row of queryRows<RelationRow>(response, 4)) {
    const postId = graphRecordId(row.in)
    const tagId = graphRecordId(row.out)
    if (!visiblePostIds.has(postId) || !tagById.has(tagId)) {
      continue
    }
    const existing = postTagIds.get(postId) ?? new Set<string>()
    existing.add(tagId)
    postTagIds.set(postId, existing)
  }

  const linkEdges = new Map()
  for (const row of queryRows<RelationRow>(response, 5)) {
    const source = graphRecordId(row.in)
    const target = graphRecordId(row.out)
    if (visiblePostIds.has(source) && visiblePostIds.has(target)) {
      addUndirectedLinkEdge(linkEdges, source, target)
    }
  }
  const degrees = graphDegreeMap(linkEdges.values())

  const counts = new Map<string, { postCount: number, degree: number, type: 'category' | 'tag' }>()
  const overviewEdges = new Map<string, GraphEdge>()
  for (const post of posts) {
    const categoryIds = [...(postCategoryIds.get(post.id) ?? [])]
    const tagIds = [...(postTagIds.get(post.id) ?? [])]
    for (const categoryId of categoryIds) {
      const current = counts.get(categoryId) ?? { postCount: 0, degree: 0, type: 'category' as const }
      current.postCount += 1
      current.degree += degrees.get(post.id) ?? 0
      counts.set(categoryId, current)
    }
    for (const tagId of tagIds) {
      const current = counts.get(tagId) ?? { postCount: 0, degree: 0, type: 'tag' as const }
      current.postCount += 1
      current.degree += degrees.get(post.id) ?? 0
      counts.set(tagId, current)
    }

    for (const categoryId of categoryIds) {
      for (const tagId of tagIds) {
        addCooccurrenceEdge(overviewEdges, categoryId, tagId)
      }
    }
    addPairEdges(overviewEdges, categoryIds)
    addPairEdges(overviewEdges, tagIds)
  }

  const rawWeights = [...counts.entries()].map(([categoryId, value]) => ({
    categoryId,
    type: value.type,
    raw: value.postCount + Math.sqrt(value.degree),
    postCount: value.postCount
  }))
  const maxWeight = Math.max(1, ...rawWeights.map((entry) => entry.raw))
  const clusters: GraphClusterAggregate[] = rawWeights
    .map((entry) => {
      const taxonomy = entry.type === 'category' ? categoryById.get(entry.categoryId) : tagById.get(entry.categoryId)
      if (!taxonomy) {
        return null
      }
      return {
        id: taxonomy.id,
        type: taxonomy.type,
        slug: taxonomy.slug,
        name: taxonomy.name,
        postCount: entry.postCount,
        heatWeight: Number((entry.raw / maxWeight).toFixed(4))
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.heatWeight - a.heatWeight || b.postCount - a.postCount || a.name.localeCompare(b.name))
  const visibleTaxonomyIds = new Set(clusters.map((cluster) => cluster.id))
  const taxonomyNodes: GraphNode[] = clusters.map((cluster) => ({
    id: cluster.id,
    type: cluster.type,
    slug: cluster.slug,
    name: cluster.name,
    postCount: cluster.postCount
  }))
  const isolatedPostNodes: GraphNode[] = posts
    .filter((post) => !postCategoryIds.has(post.id) && !postTagIds.has(post.id))
    .map((post) => toGraphPostNode(post, degrees.get(post.id) ?? 0, null))
  const nodes = [...taxonomyNodes, ...isolatedPostNodes]
  const edges = [...overviewEdges.values()].filter((edge) => visibleTaxonomyIds.has(edge.source) && visibleTaxonomyIds.has(edge.target))

  return {
    clusters,
    nodes,
    edges,
    totalPosts: posts.length,
    viewerScope: visibility.viewerScope,
    generatedAt: new Date().toISOString()
  }
})

function addPairEdges(edges: Map<string, GraphEdge>, ids: string[]) {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      addCooccurrenceEdge(edges, ids[i]!, ids[j]!)
    }
  }
}

function addCooccurrenceEdge(edges: Map<string, GraphEdge>, source: string, target: string) {
  if (!source || !target || source === target) {
    return
  }
  const [left, right] = source.localeCompare(target) <= 0 ? [source, target] : [target, source]
  const id = `cooccurs:${left}__${right}`
  if (!edges.has(id)) {
    edges.set(id, { id, source: left, target: right, type: 'cooccurs' })
  }
}

function isSyntheticCategory(slug: string, name: string) {
  const normalizedSlug = slug.trim().toLowerCase()
  const normalizedName = name.trim().toLowerCase()
  return normalizedSlug === 'default' || normalizedSlug === 'uncategorized' || normalizedName === 'default' || normalizedName === 'uncategorized'
}

function isSyntheticTag(slug: string, name: string) {
  return slug.trim().toLowerCase() === 'null' || name.trim().toLowerCase() === 'null'
}