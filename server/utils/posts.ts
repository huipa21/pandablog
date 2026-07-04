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
  const base = resolvePostSlugBase(desired)

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
  const slug = resolvePostSlugBase(desired)
  const existing = await findBySlug(db, 'post', slug)

  if (existing && (!currentRecordId || stringifyRecordId(existing.id) !== currentRecordId)) {
    throw createError({ statusCode: 409, message: `Slug "${slug}" is already used by another post` })
  }

  return slug
}

/**
 * Resolve the base slug for a post. Blank input keeps the historical
 * `untitled` fallback so empty drafts can still be saved, but input that has
 * text yet produces no usable slug (e.g. emoji/punctuation only) is rejected so
 * the author is asked for a legitimate title/slug instead of a silent fallback.
 */
function resolvePostSlugBase(desired: string): string {
  const base = slugify(desired)
  if (base) {
    return base
  }

  if (desired.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Please use a title or slug that contains letters or numbers so the post can have a valid URL.'
    })
  }

  return 'untitled'
}