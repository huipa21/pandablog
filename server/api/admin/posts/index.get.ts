import { queryDb, useDb } from '../../../utils/db'
import { normalizePost } from '../../../utils/content'
import { normalizeCategory, normalizeTag } from '../../../utils/taxonomy'
import { firstRow, queryRows, stringifyRecordId } from '../../../utils/surrealResult'
import { requireAdminUser } from '../../../utils/auth'
import type { PostRecord, PostStatus } from '~/types/content'

const statuses: Array<PostStatus | 'all'> = ['all', 'draft', 'published', 'archived']

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)

  const query = getQuery(event)
  const limit = Math.min(Number(query.limit ?? 20), 100)
  const start = Math.max(Number(query.start ?? 0), 0)
  const status = statuses.includes(query.status as PostStatus) ? query.status as PostStatus | 'all' : 'all'
  const where = status === 'all' ? 'status != "archived"' : 'status = $status'
  const db = await useDb()

  const response = await queryDb(
    db,
    `SELECT * FROM post WHERE ${where} ORDER BY updated_at DESC LIMIT $limit START $start;
     SELECT count() AS total FROM post WHERE ${where} GROUP ALL;
     SELECT * FROM tag ORDER BY name ASC;
     SELECT * FROM category ORDER BY name ASC;
    SELECT in, out FROM tagged;
    SELECT in, out FROM categorized_as;`,
    { status, limit, start }
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