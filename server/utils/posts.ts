import type { Surreal } from 'surrealdb'
import { firstRow } from './surrealResult'
import { slugify } from './content'
import { stringifyRecordId } from './surrealResult'

export async function uniquePostSlug(db: Surreal, desired: string, currentRecordId?: string) {
  const base = slugify(desired)

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
    const response = await db.query('SELECT id FROM post WHERE slug = $slug LIMIT 1;', { slug: candidate })
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