import { queryDb, useDb } from '../../../utils/db'
import { normalizePost } from '../../../utils/content'
import { normalizeCategory, normalizeTag } from '../../../utils/taxonomy'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from '../../../utils/surrealResult'
import { requireContentManager } from '../../../utils/auth'
import type { PostRecord, PostStatus } from '~/types/content'

const statuses: Array<PostStatus | 'all'> = ['all', 'draft', 'published', 'archived']
const sortOrders = {
  updated_desc: 'updated_at DESC',
  updated_asc: 'updated_at ASC',
  published_desc: 'published_at DESC, updated_at DESC',
  published_asc: 'published_at ASC, updated_at ASC'
} as const
type AdminPostSort = keyof typeof sortOrders

export default defineEventHandler(async (event) => {
  const user = await requireContentManager(event)

  const query = getQuery(event)
  const limit = normalizeLimit(query.limit)
  const start = normalizeStart(query.start)
  const status = statuses.includes(query.status as PostStatus) ? query.status as PostStatus | 'all' : 'all'
  const sort = normalizeSort(query.sort)
  const tagIds = relationIds(query.tag_ids ?? query.tags, 'tag')
  const categoryIds = relationIds(query.category_ids ?? query.categories, 'category')
  const where = status === 'all' ? 'status != "archived"' : 'status = $status'
  const ownerFilter = user.role === 'author'
    ? 'AND (author = type::record($userTable, $userId) OR (author IS NONE AND author_username = $username))'
    : ''
  const db = await useDb()
  const filteredPostIds = await resolveFilteredPostIds(db, { tagIds, categoryIds })

  if (filteredPostIds && filteredPostIds.length === 0) {
    return { posts: [], total: 0, limit, start }
  }

  const taxonomyFilter = filteredPostIds ? 'AND id IN $postIds' : ''
  const orderBy = sortOrders[sort]

  const response = await queryDb(
    db,
    `SELECT * FROM post WHERE ${where} ${ownerFilter} ${taxonomyFilter} ORDER BY ${orderBy} LIMIT $limit START $start;
     SELECT count() AS total FROM post WHERE ${where} ${ownerFilter} ${taxonomyFilter} GROUP ALL;
     SELECT * FROM tag ORDER BY name ASC;
     SELECT * FROM category ORDER BY name ASC;
    SELECT in, out FROM tagged;
    SELECT in, out FROM categorized_as;`,
    { status, limit, start, postIds: filteredPostIds ?? [], userTable: 'users', userId: recordIdPart(user.id, 'users'), username: user.username }
  )

  const posts = queryRows<Record<string, unknown>>(response, 0).map(normalizePost)
  const count = firstRow<{ total?: number }>(response, 1)
  const tags = new Map(queryRows<Record<string, unknown>>(response, 2).map((tag) => [stringifyRecordId(tag.id), normalizeTag(tag)]))
  const categories = new Map(queryRows<Record<string, unknown>>(response, 3).map((category) => [stringifyRecordId(category.id), normalizeCategory(category)]))
  const postIds = new Set(posts.map((post) => post.id))
  const tagIdsByPost = relationMap(queryRows<Record<string, unknown>>(response, 4), postIds)
  const categoryIdsByPost = relationMap(queryRows<Record<string, unknown>>(response, 5), postIds)
  const postsWithTaxonomy = posts.map((post) => {
    const tagIds = tagIdsByPost.get(post.id) ?? []
    const categoryIds = categoryIdsByPost.get(post.id) ?? []

    return {
      ...post,
      tag_ids: tagIds,
      category_ids: categoryIds,
      tags: tagIds.map((tagId) => tags.get(tagId)).filter(isDefined),
      categories: categoryIds.map((categoryId) => categories.get(categoryId)).filter(isDefined)
    }
  })

  return {
    posts: postsWithTaxonomy satisfies PostRecord[],
    total: Number(count?.total ?? postsWithTaxonomy.length),
    limit,
    start
  }
})

function normalizeSort(value: unknown): AdminPostSort {
  return Object.keys(sortOrders).includes(String(value)) ? value as AdminPostSort : 'updated_desc'
}

function normalizeLimit(value: unknown) {
  const limit = Number(value ?? 10)
  return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 10
}

function normalizeStart(value: unknown) {
  const start = Number(value ?? 0)
  return Number.isFinite(start) ? Math.max(start, 0) : 0
}

function relationIds(value: unknown, table: 'category' | 'tag') {
  const values = Array.isArray(value) ? value : [value]

  return Array.from(new Set(
    values
      .flatMap((entry) => String(entry ?? '').split(','))
      .map((entry) => recordIdPart(entry.trim(), table))
      .filter(Boolean)
  ))
}

async function resolveFilteredPostIds(
  db: Awaited<ReturnType<typeof useDb>>,
  filters: { tagIds: string[], categoryIds: string[] }
) {
  const groups: unknown[][] = []

  if (filters.tagIds.length) {
    groups.push(await relationPostIds(db, 'tag', 'tagged', filters.tagIds))
  }

  if (filters.categoryIds.length) {
    groups.push(await relationPostIds(db, 'category', 'categorized_as', await expandCategoryIds(db, filters.categoryIds)))
  }

  if (!groups.length) {
    return null
  }

  const maps = groups.map((group) => new Map(group.map((id) => [stringifyRecordId(id), id])))
  const [firstMap] = maps
  if (!firstMap) {
    return []
  }

  return Array.from(firstMap.keys())
    .filter((key) => maps.every((map) => map.has(key)))
    .map((key) => firstMap.get(key))
}

async function expandCategoryIds(db: Awaited<ReturnType<typeof useDb>>, ids: string[]) {
  const response = await queryDb(db, 'SELECT id, parent FROM category;')
  const categories = queryRows<Record<string, unknown>>(response).map((category) => ({
    id: recordIdPart(stringifyRecordId(category.id), 'category'),
    parentId: category.parent ? recordIdPart(stringifyRecordId(category.parent), 'category') : null
  }))
  const selected = new Set(ids)
  let changed = true

  while (changed) {
    changed = false

    for (const category of categories) {
      if (category.parentId && selected.has(category.parentId) && !selected.has(category.id)) {
        selected.add(category.id)
        changed = true
      }
    }
  }

  return Array.from(selected)
}

async function relationPostIds(
  db: Awaited<ReturnType<typeof useDb>>,
  table: 'category' | 'tag',
  relation: 'categorized_as' | 'tagged',
  ids: string[]
) {
  const postIds: unknown[] = []

  for (const id of ids) {
    const response = await queryDb(
      db,
      `SELECT in FROM ${relation} WHERE out = type::record($table, $id);`,
      { table, id }
    )
    postIds.push(...queryRows<Record<string, unknown>>(response).map((row) => row.in).filter(Boolean))
  }

  return postIds
}

function relationMap(rows: Array<Record<string, unknown>>, postIds: Set<string>) {
  const map = new Map<string, string[]>()

  for (const row of rows) {
    const postId = stringifyRecordId(row.in)
    if (!postIds.has(postId)) {
      continue
    }

    const targetId = stringifyRecordId(row.out)
    map.set(postId, [...(map.get(postId) ?? []), targetId])
  }

  return map
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}