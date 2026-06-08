import type { Surreal } from 'surrealdb'
import { slugify } from './content'
import { findBySlug } from './db'
import { stringifyRecordId } from './surrealResult'

export async function uniquePostSlug(db: Surreal, desired: string, currentRecordId?: string) {
  const base = slugify(desired)

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
    const existing = await findBySlug(db, 'post', candidate)

    if (!existing) {
      return candidate
    }

    if (currentRecordId && stringifyRecordId(existing.id) === currentRecordId) {
      return candidate
    }
  }

  return `${base}-${Date.now()}`
}