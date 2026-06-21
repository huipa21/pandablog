import type { Surreal } from 'surrealdb'
import { slugify } from './content'
import { findBySlug } from './db'
import { stringifyRecordId } from './surrealResult'

export type AdminPostDisplayMode = 'slug' | 'id'

export const ADMIN_POST_DISPLAY_MODE_KEY = 'admin_post_display_mode'

export function normalizeAdminPostDisplayMode(value: unknown): AdminPostDisplayMode {
  return value === 'id' ? 'id' : 'slug'
}

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

export async function assertPostSlugAvailable(db: Surreal, desired: string, currentRecordId?: string) {
  const slug = slugify(desired)
  const existing = await findBySlug(db, 'post', slug)

  if (existing && (!currentRecordId || stringifyRecordId(existing.id) !== currentRecordId)) {
    throw createError({ statusCode: 409, message: `Slug "${slug}" is already used by another post` })
  }

  return slug
}