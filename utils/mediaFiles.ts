import type { MediaRecord } from '~/types/content'
import { classifyMedia, formatBytes } from '~/composables/useMediaKind'

export interface MediaFileItem {
  src: string
  alt?: string
  title?: string
  name?: string
  mime?: string
  size?: number | null
  width?: number | null
  height?: number | null
  hash?: string
}

export function mediaRecordToFileItem(file: MediaRecord, toPublicSrc: (value: string) => string): MediaFileItem {
  const source = file.hash || file.id || file.url || ''
  return {
    src: toPublicSrc(source) || file.url || '',
    alt: file.original_name || '',
    title: '',
    name: file.original_name || '',
    mime: file.mime_type || '',
    size: typeof file.size === 'number' ? file.size : null,
    width: typeof file.width === 'number' ? file.width : null,
    height: typeof file.height === 'number' ? file.height : null,
    hash: file.hash || ''
  }
}

export function mediaFilesFromAttrs(attrs: Record<string, unknown> | undefined, key = 'mediaItems'): MediaFileItem[] {
  const items = normalizeMediaFileItems(attrs?.[key])
  if (items.length) return items

  const legacy = legacyMediaAttrsToFileItem(attrs)
  return legacy ? [legacy] : []
}

export function legacyMediaAttrsToFileItem(attrs: Record<string, unknown> | undefined): MediaFileItem | null {
  const src = stringValue(attrs?.mediaSrc)
  if (!src) return null

  return {
    src,
    alt: stringValue(attrs?.mediaAlt),
    title: stringValue(attrs?.mediaTitle),
    name: stringValue(attrs?.mediaName) || stringValue(attrs?.mediaAlt),
    mime: stringValue(attrs?.mediaMime),
    size: numberOrNull(attrs?.mediaSize),
    width: numberOrNull(attrs?.mediaNaturalWidth) ?? numberOrNull(attrs?.mediaWidth),
    height: numberOrNull(attrs?.mediaNaturalHeight) ?? numberOrNull(attrs?.mediaHeight)
  }
}

export function normalizeMediaFileItems(value: unknown): MediaFileItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((raw) => normalizeMediaFileItem(raw))
    .filter((item): item is MediaFileItem => !!item?.src)
}

export function normalizeMediaFileItem(value: unknown): MediaFileItem | null {
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  const src = stringValue(record.src) || stringValue(record.url) || stringValue(record.mediaSrc)
  if (!src) return null

  return {
    src,
    alt: stringValue(record.alt) || stringValue(record.mediaAlt),
    title: stringValue(record.title) || stringValue(record.mediaTitle),
    name: stringValue(record.name) || stringValue(record.mediaName) || stringValue(record.original_name),
    mime: stringValue(record.mime) || stringValue(record.mime_type) || stringValue(record.mediaMime),
    size: numberOrNull(record.size) ?? numberOrNull(record.mediaSize),
    width: numberOrNull(record.width) ?? numberOrNull(record.mediaNaturalWidth) ?? numberOrNull(record.mediaWidth),
    height: numberOrNull(record.height) ?? numberOrNull(record.mediaNaturalHeight) ?? numberOrNull(record.mediaHeight),
    hash: stringValue(record.hash)
  }
}

export function mediaFileName(item: MediaFileItem) {
  return item.name?.trim() || item.alt?.trim() || fileNameFromSrc(item.src) || 'Attachment'
}

export function mediaFileKind(item: MediaFileItem) {
  return classifyMedia(item.mime, mediaFileName(item) || item.src)
}

export function mediaFileTypeLabel(item: MediaFileItem) {
  const mime = (item.mime || '').toLowerCase()
  const ext = mediaFileExtension(item)

  if (['doc', 'docx'].includes(ext) || mime.includes('wordprocessingml') || mime === 'application/msword') return 'Word document'
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('spreadsheetml')) return ext === 'csv' ? 'CSV file' : 'Spreadsheet'
  if (['ppt', 'pptx'].includes(ext) || mime.includes('presentationml')) return 'Presentation'
  if (ext === 'pdf' || mime === 'application/pdf') return 'PDF'
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'Archive'
  if (['txt', 'md', 'log'].includes(ext) || mime.startsWith('text/')) return 'Text file'

  const kind = mediaFileKind(item)
  if (kind === 'image') return 'Image'
  if (kind === 'video') return 'Video'
  if (kind === 'audio') return 'Audio'
  return ext ? `${ext.toUpperCase()} file` : 'File'
}

export function mediaFileDetail(item: MediaFileItem) {
  const size = formatBytes(item.size)
  const type = mediaFileTypeLabel(item)
  const dimensions = item.width && item.height ? `${item.width}x${item.height}` : ''
  return [size, type, dimensions].filter(Boolean).join(' · ')
}

export function mediaFileExtension(item: MediaFileItem) {
  const name = mediaFileName(item) || item.src
  return (name.split('?')[0]?.split('#')[0]?.split('.').pop() || '').toLowerCase()
}

function fileNameFromSrc(src: string) {
  const raw = (src.split('?')[0]?.split('#')[0]?.split('/').pop() || '').trim()
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}