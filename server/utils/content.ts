import type { PostRecord, PostStatus, PostVisibility } from '~/types/content'
import { emptyDoc } from './blocks'
import { stringifyRecordId } from './surrealResult'

const allowedStatuses: PostStatus[] = ['draft', 'published', 'archived']

export function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 96) || 'untitled'
}

export function cleanStatus(value: unknown): PostStatus {
  return allowedStatuses.includes(value as PostStatus) ? value as PostStatus : 'draft'
}

/**
 * Convert a raw `post` row from SurrealDB into the public PostRecord shape.
 * Block content is *not* loaded here — callers that need the rendered doc
 * should also call `loadBlocksForPost` and set `content_json` accordingly.
 */
export function normalizePost(record: Record<string, unknown>): PostRecord {
  return {
    id: stringifyRecordId(record.id),
    title: String(record.title ?? ''),
    slug: String(record.slug ?? ''),
    summary: record.summary === undefined ? null : record.summary as string | null,
    content_json: emptyDoc(),
    status: cleanStatus(record.status),
    cover_image: record.cover_image === undefined ? null : record.cover_image as string | null,
    author_username: String(record.author_username ?? 'admin'),
    published_at: serializeDate(record.published_at),
    is_featured: cleanFeatured(record.is_featured),
    featured_at: serializeDate(record.featured_at),
    created_at: serializeDate(record.created_at) ?? new Date().toISOString(),
    updated_at: serializeDate(record.updated_at) ?? new Date().toISOString(),
    view_count: Number(record.view_count ?? 0),
    word_count: Number(record.word_count ?? 0),
    cjk_char_count: Number(record.cjk_char_count ?? 0),
    visibility: cleanVisibility(record.visibility),
    password_hint: record.password_hint === undefined ? null : record.password_hint as string | null
  }
}

export function serializeDate(value: unknown): string | null {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return String(value)
}

/**
 * Coerce a value into a JS `Date` suitable for SurrealDB `datetime` bindings.
 * SurrealDB's schemafull `datetime` fields will NOT accept raw ISO strings via
 * parameter binding, so any string coming from the client must be parsed into
 * a `Date` before it reaches the query. Returns `null` for empty/invalid input.
 */
export function toDatetime(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null
  }

  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }

  // Already a SurrealDB-native datetime (tagged object) — let the driver
  // pass it through unchanged.
  if (typeof value === 'object') {
    return value as unknown as Date
  }

  return null
}

/**
 * Build the persisted post-meta payload from form input. Block content is
 * handled separately by `syncPostBlocks` and is intentionally *not* included
 * in the returned payload.
 */
export function buildPostPayload(input: Record<string, unknown>, authorUsername: string) {
  const title = String(input.title ?? '').trim()
  const status = cleanStatus(input.status)
  const now = new Date()
  const summary = stringOrNull(input.summary)
  const coverImage = stringOrNull(input.cover_image)
  const isFeatured = cleanFeatured(input.is_featured)
  const payload: Record<string, unknown> = {
    title,
    slug: slugify(String(input.slug || title)),
    status,
    author_username: authorUsername,
    is_featured: isFeatured,
    updated_at: now
  }

  if (summary) {
    payload.summary = summary
  }

  if (coverImage) {
    payload.cover_image = coverImage
  }

  if (status === 'published') {
    payload.published_at = toDatetime(input.published_at) ?? now
  }

  if (isFeatured) {
    payload.featured_at = toDatetime(input.featured_at) ?? now
  }

  return payload
}

export function cleanFeatured(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

export function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function cleanVisibility(value: unknown): PostVisibility {
  return ['public', 'private', 'password'].includes(String(value))
    ? value as PostVisibility
    : 'public'
}
