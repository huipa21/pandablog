import type { JsonContent, PostRecord, PostStatus, PostVisibility } from '~/types/content'
import { stringifyRecordId } from './surrealResult'

const allowedStatuses: PostStatus[] = ['draft', 'published', 'archived']

export function emptyDoc(): JsonContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: []
      }
    ]
  }
}

export function flattenContent(node: JsonContent | null | undefined): string {
  if (!node) {
    return ''
  }

  if (node.type === 'text') {
    return node.text ?? ''
  }

  if (node.type === 'wikiLink') {
    return stringAttr(node.attrs?.label) || stringAttr(node.attrs?.target)
  }

  if (node.type === 'mermaid') {
    return stringAttr(node.attrs?.code)
  }

  if (node.type === 'image') {
    return stringAttr(node.attrs?.alt) || stringAttr(node.attrs?.title)
  }

  const ownText = typeof node.text === 'string' ? node.text : ''
  const childText = node.content?.map(flattenContent).filter(Boolean).join(' ') ?? ''
  return [ownText, childText].filter(Boolean).join(' ')
}

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

export function normalizePost(record: Record<string, unknown>): PostRecord {
  return {
    id: stringifyRecordId(record.id),
    title: String(record.title ?? ''),
    slug: String(record.slug ?? ''),
    summary: record.summary === undefined ? null : record.summary as string | null,
    content_json: record.content_json as JsonContent ?? emptyDoc(),
    content_text: String(record.content_text ?? ''),
    status: cleanStatus(record.status),
    cover_image: record.cover_image === undefined ? null : record.cover_image as string | null,
    author_username: String(record.author_username ?? 'admin'),
    published_at: serializeDate(record.published_at),
    created_at: serializeDate(record.created_at) ?? new Date().toISOString(),
    updated_at: serializeDate(record.updated_at) ?? new Date().toISOString(),
    view_count: Number(record.view_count ?? 0),
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

export function buildPostPayload(input: Record<string, unknown>, authorUsername: string) {
  const title = String(input.title ?? '').trim()
  const contentJson = (input.content_json && typeof input.content_json === 'object')
    ? input.content_json as JsonContent
    : emptyDoc()
  const status = cleanStatus(input.status)
  const now = new Date()
  const summary = stringOrNull(input.summary)
  const coverImage = stringOrNull(input.cover_image)
  const payload: Record<string, unknown> = {
    title,
    slug: slugify(String(input.slug || title)),
    content_json: contentJson,
    content_text: flattenContent(contentJson),
    status,
    author_username: authorUsername,
    updated_at: now
  }

  if (summary) {
    payload.summary = summary
  }

  if (coverImage) {
    payload.cover_image = coverImage
  }

  if (status === 'published') {
    payload.published_at = input.published_at ?? now
  }

  return payload
}

export function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function stringAttr(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanVisibility(value: unknown): PostVisibility {
  return ['public', 'private', 'password'].includes(String(value))
    ? value as PostVisibility
    : 'public'
}