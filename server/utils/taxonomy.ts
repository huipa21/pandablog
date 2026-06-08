import type { Surreal } from 'surrealdb'
import { slugify } from './content'
import { findBySlug, queryDb } from './db'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from './surrealResult'
import type { CategoryRecord, TagRecord } from '~/types/content'

export function normalizeCategory(record: Record<string, unknown>): CategoryRecord {
  return {
    id: stringifyRecordId(record.id),
    name: String(record.name ?? ''),
    slug: String(record.slug ?? ''),
    description: record.description === undefined ? null : record.description as string | null,
    parent_id: normalizeParentRecordId(record.parent),
    post_count: Number(record.post_count ?? 0)
  }
}

function normalizeParentRecordId(value: unknown) {
  if (!value) {
    return null
  }

  const id = stringifyRecordId(value)
  return id && id !== 'null' && id !== 'undefined' ? id : null
}

export function normalizeTag(record: Record<string, unknown>): TagRecord {
  return {
    id: stringifyRecordId(record.id),
    name: String(record.name ?? ''),
    slug: String(record.slug ?? ''),
    post_count: Number(record.post_count ?? 0),
    media_count: Number(record.media_count ?? 0)
  }
}

export async function uniqueTaxonomySlug(db: Surreal, table: 'category' | 'tag', desired: string, currentRecordId?: string) {
  const base = slugify(desired)

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
    const existing = await findBySlug(db, table, candidate)

    if (!existing) {
      return candidate
    }

    if (currentRecordId && stringifyRecordId(existing.id) === currentRecordId) {
      return candidate
    }
  }

  return `${base}-${Date.now()}`
}

export async function readPostTaxonomy(db: Surreal, postId: string) {
  const response = await queryDb(
    db,
    `SELECT out FROM tagged WHERE in = type::record($postTable, $postId);
     SELECT out FROM categorized_as WHERE in = type::record($postTable, $postId);`,
    { postTable: 'post', postId }
  )

  return {
    tag_ids: queryRows<Record<string, unknown>>(response, 0).map((row) => stringifyRecordId(row.out)),
    category_ids: queryRows<Record<string, unknown>>(response, 1).map((row) => stringifyRecordId(row.out))
  }
}

export async function syncPostTaxonomy(
  db: Surreal,
  postId: string,
  tagIds?: unknown,
  categoryIds?: unknown,
  tagNames?: unknown,
  categoryNames?: unknown
) {
  const stmts: string[] = []
  const params: Record<string, unknown> = { postTable: 'post', postId }

  if (Array.isArray(tagIds) || Array.isArray(tagNames)) {
    stmts.push('DELETE tagged WHERE in = type::record($postTable, $postId);')
    let resolvedTagIds = await ensureTaxonomyIds(db, 'tag', tagIds, tagNames)
    // Remove the "null" placeholder tag if real tags are present
    const nullTagId = await getNullTagId(db)
    if (resolvedTagIds.length > 0 && nullTagId) {
      resolvedTagIds = resolvedTagIds.filter((id) => id !== nullTagId)
    }
    // If no real tags remain, assign the "null" tag
    if (resolvedTagIds.length === 0) {
      resolvedTagIds = await ensureNullTagId(db)
    }
    for (let i = 0; i < resolvedTagIds.length; i++) {
      params[`tagId_${i}`] = resolvedTagIds[i]
      stmts.push(
        `RELATE (type::record($postTable, $postId))->tagged->(type::record('tag', $tagId_${i}));`
      )
    }
  }

  if (Array.isArray(categoryIds) || Array.isArray(categoryNames)) {
    stmts.push('DELETE categorized_as WHERE in = type::record($postTable, $postId);')
    const resolvedCatIds = await ensureTaxonomyIds(db, 'category', categoryIds, categoryNames)
    // If no categories, assign the "default" category
    const finalCatIds = resolvedCatIds.length > 0
      ? resolvedCatIds
      : await ensureDefaultCategoryId(db)
    for (let i = 0; i < finalCatIds.length; i++) {
      params[`catId_${i}`] = finalCatIds[i]
      stmts.push(
        `RELATE (type::record($postTable, $postId))->categorized_as->(type::record('category', $catId_${i}));`
      )
    }
  }

  if (stmts.length) {
    await queryDb(db, stmts.join('\n'), params, { label: 'batch-sync taxonomy' })
  }
}

async function ensureDefaultCategoryId(db: Surreal): Promise<string[]> {
  const response = await queryDb(db, `SELECT id FROM category WHERE slug = 'default' LIMIT 1;`, {})
  const existing = firstRow<{ id: unknown }>(response)
  if (existing?.id) {
    return [recordIdPart(stringifyRecordId(existing.id), 'category')]
  }
  const createResponse = await queryDb(db, `CREATE category CONTENT $record;`, {
    record: { name: 'Default', slug: 'default' }
  })
  const created = firstRow<{ id: unknown }>(createResponse)
  return created?.id ? [recordIdPart(stringifyRecordId(created.id), 'category')] : []
}

async function getNullTagId(db: Surreal): Promise<string | null> {
  const response = await queryDb(db, `SELECT id FROM tag WHERE slug = 'null' LIMIT 1;`, {})
  const existing = firstRow<{ id: unknown }>(response)
  return existing?.id ? recordIdPart(stringifyRecordId(existing.id), 'tag') : null
}

async function ensureNullTagId(db: Surreal): Promise<string[]> {
  const response = await queryDb(db, `SELECT id FROM tag WHERE slug = 'null' LIMIT 1;`, {})
  const existing = firstRow<{ id: unknown }>(response)
  if (existing?.id) {
    return [recordIdPart(stringifyRecordId(existing.id), 'tag')]
  }
  const createResponse = await queryDb(db, `CREATE tag CONTENT $record;`, {
    record: { name: 'null', slug: 'null' }
  })
  const created = firstRow<{ id: unknown }>(createResponse)
  return created?.id ? [recordIdPart(stringifyRecordId(created.id), 'tag')] : []
}

export function taxonomyName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }
  return name
}

export function taxonomyParentId(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const id = recordIdPart(value, 'category').trim()
  return id || null
}

export async function assertValidCategoryParent(
  db: Surreal,
  categoryId: string | null,
  parentId: string | null,
  targetSlug?: string
) {
  if (!parentId) {
    return
  }

  const response = await queryDb(db, 'SELECT id, slug, parent FROM category;')
  const categories = queryRows<Record<string, unknown>>(response).map((category) => ({
    id: stringifyRecordId(category.id),
    idPart: recordIdPart(stringifyRecordId(category.id), 'category'),
    slug: String(category.slug ?? ''),
    parent_id: normalizeParentRecordId(category.parent)
  }))
  const parentRecordId = `category:${parentId}`
  const current = categoryId
    ? categories.find((category) => category.idPart === categoryId || category.id === `category:${categoryId}`)
    : null
  const parent = categories.find((category) => category.idPart === parentId || category.id === parentRecordId)

  if (!parent) {
    throw createError({ statusCode: 400, message: 'Parent category was not found' })
  }

  if ((targetSlug ?? current?.slug) === 'default') {
    throw createError({ statusCode: 400, message: 'Default category cannot be nested' })
  }

  if (parent.slug === 'default') {
    throw createError({ statusCode: 400, message: 'Default category cannot be a parent' })
  }

  if (categoryId && (parent.idPart === categoryId || parent.id === `category:${categoryId}`)) {
    throw createError({ statusCode: 400, message: 'Category cannot be its own parent' })
  }

  if (categoryId && isDescendant(parent.id, `category:${categoryId}`, categories)) {
    throw createError({ statusCode: 400, message: 'Category cannot use one of its children as parent' })
  }

  const parentLevel = categoryDepth(parent.id, categories)
  const subtreeDepth = categoryId ? descendantDepth(`category:${categoryId}`, categories) : 0

  if (parentLevel + 1 + subtreeDepth > 2) {
    throw createError({ statusCode: 400, message: 'Categories can only be nested three levels deep' })
  }
}

function categoryDepth(id: string, categories: Array<{ id: string, parent_id: string | null }>, seen = new Set<string>()): number {
  if (seen.has(id)) {
    return 0
  }

  seen.add(id)
  const category = categories.find((item) => item.id === id)
  if (!category?.parent_id || !categories.some((item) => item.id === category.parent_id)) {
    return 0
  }

  return categoryDepth(category.parent_id, categories, seen) + 1
}

function descendantDepth(id: string, categories: Array<{ id: string, parent_id: string | null }>, seen = new Set<string>()): number {
  if (seen.has(id)) {
    return 0
  }

  seen.add(id)
  const children = categories.filter((category) => category.parent_id === id)
  if (!children.length) {
    return 0
  }

  return Math.max(...children.map((child) => descendantDepth(child.id, categories, new Set(seen)) + 1))
}

function isDescendant(candidateId: string, ancestorId: string, categories: Array<{ id: string, parent_id: string | null }>) {
  let current = categories.find((category) => category.id === candidateId)
  const seen = new Set<string>()

  while (current?.parent_id && !seen.has(current.id)) {
    if (current.parent_id === ancestorId) {
      return true
    }

    seen.add(current.id)
    current = categories.find((category) => category.id === current?.parent_id)
  }

  return false
}

function normalizeRelationIds(values: unknown[], table: 'category' | 'tag') {
  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => recordIdPart(value, table).trim())
      .filter(Boolean)
  ))
}

function normalizeTaxonomyNames(values: unknown) {
  if (!Array.isArray(values)) {
    return []
  }

  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  ))
}

async function ensureTaxonomyIds(
  db: Surreal,
  table: 'category' | 'tag',
  idsInput: unknown,
  namesInput: unknown
) {
  const resolvedIds = new Set(
    Array.isArray(idsInput)
      ? normalizeRelationIds(idsInput, table)
      : []
  )

  for (const name of normalizeTaxonomyNames(namesInput)) {
    const baseSlug = slugify(name)
    const existing = await findBySlug(db, table, baseSlug)

    if (existing?.id) {
      resolvedIds.add(recordIdPart(stringifyRecordId(existing.id), table))
      continue
    }

    const slug = await uniqueTaxonomySlug(db, table, name)
    const createResponse = await queryDb(db, `CREATE ${table} CONTENT $record;`, {
      record: { name, slug }
    })
    const created = firstRow<{ id: unknown }>(createResponse)

    if (created?.id) {
      resolvedIds.add(recordIdPart(stringifyRecordId(created.id), table))
    }
  }

  return Array.from(resolvedIds)
}

