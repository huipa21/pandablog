import type { Surreal } from 'surrealdb'
import { slugify } from './content'
import { queryDb } from './db'
import { firstRow, queryRows, recordIdPart, stringifyRecordId } from './surrealResult'
import type { CategoryRecord, TagRecord } from '~/types/content'

export function normalizeCategory(record: Record<string, unknown>): CategoryRecord {
  return {
    id: stringifyRecordId(record.id),
    name: String(record.name ?? ''),
    slug: String(record.slug ?? ''),
    description: record.description === undefined ? null : record.description as string | null,
    post_count: Number(record.post_count ?? 0)
  }
}

export function normalizeTag(record: Record<string, unknown>): TagRecord {
  return {
    id: stringifyRecordId(record.id),
    name: String(record.name ?? ''),
    slug: String(record.slug ?? ''),
    post_count: Number(record.post_count ?? 0)
  }
}

export async function uniqueTaxonomySlug(db: Surreal, table: 'category' | 'tag', desired: string, currentRecordId?: string) {
  const base = slugify(desired)

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
    const response = await queryDb(db, `SELECT id FROM ${table} WHERE slug = $slug LIMIT 1;`, { slug: candidate })
    const existing = firstRow<{ id: unknown }>(response)

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
  if (Array.isArray(tagIds) || Array.isArray(tagNames)) {
    await queryDb(db, 'DELETE tagged WHERE in = type::record($postTable, $postId);', {
      postTable: 'post',
      postId
    })

    for (const tagId of await ensureTaxonomyIds(db, 'tag', tagIds, tagNames)) {
      await queryDb(
        db,
        'RELATE type::record($postTable, $postId)->tagged->type::record($tagTable, $tagId);',
        { postTable: 'post', postId, tagTable: 'tag', tagId }
      )
    }
  }

  if (Array.isArray(categoryIds) || Array.isArray(categoryNames)) {
    await queryDb(db, 'DELETE categorized_as WHERE in = type::record($postTable, $postId);', {
      postTable: 'post',
      postId
    })

    for (const categoryId of await ensureTaxonomyIds(db, 'category', categoryIds, categoryNames)) {
      await queryDb(
        db,
        'RELATE type::record($postTable, $postId)->categorized_as->type::record($categoryTable, $categoryId);',
        { postTable: 'post', postId, categoryTable: 'category', categoryId }
      )
    }
  }
}

export function taxonomyName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }
  return name
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
    const existingBySlug = await queryDb(db, `SELECT id FROM ${table} WHERE slug = $slug LIMIT 1;`, { slug: baseSlug })
    const existing = firstRow<{ id: unknown }>(existingBySlug)

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
