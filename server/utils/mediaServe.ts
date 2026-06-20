import type { H3Event } from 'h3'
import { getSessionUser } from './auth'
import { queryDbRecord, useDb } from './db'
import { mediaCreateOriginalStream, mediaCreateVariantStream, mediaStatOriginal, mediaStatVariant } from './fileStorage'
import { assertLocalMediaRequest, assertSameSiteMediaRequest } from './mediaAccess'
import { mediaNormalizeFileRecord, mediaNormalizeHash } from './mediaLibrary'
import { mediaRecordVisibleToUser } from './mediaPermissions'
import type { MediaVariantSize } from '~/types/content'

const allowedVariantSizes = new Set<MediaVariantSize>(['thumbnail', 'medium', 'large'])

// Content types that can carry active content (scripts) when rendered inline.
// These are always served as downloads with a neutralizing CSP so a stored file
// can never execute script in the site's origin.
const ACTIVE_CONTENT_TYPES = new Set([
  'image/svg+xml',
  'image/svg',
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'application/xml'
])

function applyContentTypeGuards(event: H3Event, mimeType: string, originalName: string, isDownload: boolean) {
  const normalized = (mimeType || 'application/octet-stream').toLowerCase()
  const forceAttachment = isDownload || ACTIVE_CONTENT_TYPES.has(normalized)

  setResponseHeader(event, 'Content-Type', mimeType || 'application/octet-stream')
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  if (ACTIVE_CONTENT_TYPES.has(normalized)) {
    // Belt-and-suspenders: even if forced to download, deny any execution.
    setResponseHeader(event, 'Content-Security-Policy', "default-src 'none'; sandbox")
  }
  setResponseHeader(event, 'Content-Disposition', `${forceAttachment ? 'attachment' : 'inline'}; filename="${encodeHeaderValue(originalName)}"`)
}


export async function serveOriginalMedia(event: H3Event, id: string, options: { localOnly?: boolean } = {}) {
  if (options.localOnly) {
    await assertLocalMediaRequest(event)
  }

  const hash = mediaNormalizeHash(id)
  const db = await useDb()
  const record = await queryDbRecord(db, 'files', hash)

  if (!record) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  const file = mediaNormalizeFileRecord(record)
  const user = await getSessionUser(event)
  if (!mediaRecordVisibleToUser(file, user)) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }
  await assertSameSiteMediaRequest(event, user)

  try {
    const stats = await mediaStatOriginal(file.original_path || '')
    const isDownload = getQuery(event).download === 'true'
    setResponseHeader(event, 'Content-Length', stats.size)
    setResponseHeader(event, 'Cache-Control', isDownload ? 'no-cache' : 'public, max-age=31536000, immutable')
    applyContentTypeGuards(event, file.mime_type || 'application/octet-stream', file.original_name, isDownload)
    return sendStream(event, mediaCreateOriginalStream(file.original_path || ''))
  } catch {
    throw createError({ statusCode: 404, message: 'File not found on disk' })
  }
}

export async function serveMediaVariant(event: H3Event, id: string, size: string, options: { localOnly?: boolean } = {}) {
  if (options.localOnly) {
    await assertLocalMediaRequest(event)
  }

  const hash = mediaNormalizeHash(id)
  const sizeParam = String(size || '').trim().toLowerCase() as MediaVariantSize

  if (!allowedVariantSizes.has(sizeParam)) {
    throw createError({ statusCode: 400, message: 'Invalid variant size' })
  }

  const db = await useDb()
  const record = await queryDbRecord(db, 'files', hash)

  if (!record) {
    throw createError({ statusCode: 404, message: 'Variant not found' })
  }

  const file = mediaNormalizeFileRecord(record)
  const user = await getSessionUser(event)
  if (!mediaRecordVisibleToUser(file, user)) {
    throw createError({ statusCode: 404, message: 'Variant not found' })
  }
  await assertSameSiteMediaRequest(event, user)

  const variant = file.variants?.[sizeParam]
  if (!variant?.path) {
    throw createError({ statusCode: 404, message: 'Variant not found' })
  }

  try {
    const stats = await mediaStatVariant(variant.path)
    setResponseHeader(event, 'Content-Type', variant.mime_type || 'image/webp')
    setResponseHeader(event, 'Content-Length', stats.size)
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    return sendStream(event, mediaCreateVariantStream(variant.path))
  } catch {
    throw createError({ statusCode: 404, message: 'Variant not found on disk' })
  }
}

function encodeHeaderValue(value: string) {
  return value.replace(/["\\\r\n]/g, '_')
}