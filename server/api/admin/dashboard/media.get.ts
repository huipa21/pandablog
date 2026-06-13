import { queryDb, useDb } from '../../../utils/db'
import { requireContentManager } from '../../../utils/auth'
import { getMediaSettings } from '../../../utils/settings'
import { queryRows } from '../../../utils/surrealResult'

interface MediaDashboardFileRow {
  hash?: unknown
  original_name?: unknown
  mime_type?: unknown
  extension?: unknown
  size?: unknown
  is_image?: unknown
  reference_count?: unknown
  referenced_by?: unknown
  uploaded_at?: unknown
}

type MediaDashboardType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other'
type RangePreset = 'today' | '7d' | '30d' | '90d' | 'all'

interface MediaDashboardFileItem {
  hash: string
  name: string
  type: MediaDashboardType
  size: number
  reference_count: number
  referenced_by_count: number
  uploaded_at: string
}

interface TypeStat {
  type: MediaDashboardType
  count: number
  storage: number
}

const dashboardTypes: MediaDashboardType[] = ['image', 'video', 'audio', 'document', 'archive', 'other']
const documentExtensions = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'])
const archiveExtensions = new Set(['zip', 'rar', '7z', 'tar', 'gz'])
const rangePresets = new Set<RangePreset>(['today', '7d', '30d', '90d', 'all'])
const listLimit = 10
const bytesPerMb = 1024 * 1024

export default defineEventHandler(async (event) => {
  await requireContentManager(event)

  const query = getQuery(event)
  const range = rangeQuery(query.range)
  const [db, settings] = await Promise.all([useDb(), getMediaSettings()])
  const response = await queryDb(
    db,
    `SELECT hash, original_name, mime_type, extension, size, is_image, reference_count, referenced_by, uploaded_at FROM files;`,
    undefined,
    { label: 'admin media dashboard' }
  )

  const files = queryRows<MediaDashboardFileRow>(response).map(normalizeFileRow)
  const byType = buildTypeStats(files)
  const totalItems = files.length
  const totalStorage = sum(files, file => file.size)
  const thresholdMb = settings.oversized_image_threshold_mb > 0
    ? settings.oversized_image_threshold_mb
    : settings.max_file_size_mb / 10
  const oversizedThresholdBytes = Math.round(thresholdMb * bytesPerMb)
  const oversizedImages = files
    .filter(file => file.type === 'image' && file.size > oversizedThresholdBytes)
    .toSorted(sortBySizeThenName)
  const timeInsights = buildTimeInsights(files, range, oversizedThresholdBytes)

  return {
    summary: {
      total_items: totalItems,
      total_storage: totalStorage,
      average_size: average(totalStorage, totalItems)
    },
    by_type: byType,
    largest_files: files.toSorted(sortBySizeThenName).slice(0, listLimit),
    oversized: {
      threshold_bytes: oversizedThresholdBytes,
      count: oversizedImages.length,
      files: oversizedImages.slice(0, listLimit)
    },
    orphans: buildOrphans(files),
    time_insights: timeInsights,
    most_reused: files
      .filter(file => file.reference_count > 1)
      .toSorted((a, b) => b.reference_count - a.reference_count || b.size - a.size || a.name.localeCompare(b.name))
      .slice(0, listLimit)
  }
})

function normalizeFileRow(row: MediaDashboardFileRow): MediaDashboardFileItem {
  const hash = String(row.hash ?? '')
  const mimeType = String(row.mime_type ?? '')
  const extension = String(row.extension ?? '').toLowerCase()

  return {
    hash,
    name: String(row.original_name || hash || 'Untitled file'),
    type: classifyFile(row.is_image === true, mimeType, extension),
    size: numberValue(row.size),
    reference_count: numberValue(row.reference_count),
    referenced_by_count: Array.isArray(row.referenced_by) ? row.referenced_by.length : 0,
    uploaded_at: String(row.uploaded_at ?? '')
  }
}

function classifyFile(isImage: boolean, mimeType: string, extension: string): MediaDashboardType {
  if (isImage) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (documentExtensions.has(extension)) return 'document'
  if (archiveExtensions.has(extension)) return 'archive'
  return 'other'
}

function buildTypeStats(files: MediaDashboardFileItem[]): TypeStat[] {
  const stats = new Map<MediaDashboardType, TypeStat>(dashboardTypes.map(type => [type, { type, count: 0, storage: 0 }]))

  for (const file of files) {
    const stat = stats.get(file.type)
    if (!stat) continue
    stat.count += 1
    stat.storage += file.size
  }

  return dashboardTypes.map(type => stats.get(type)!)
}

function buildOrphans(files: MediaDashboardFileItem[]) {
  const orphans = files
    .filter(file => file.reference_count === 0 && file.referenced_by_count === 0)
    .toSorted((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime() || b.size - a.size || a.name.localeCompare(b.name))

  return {
    count: orphans.length,
    files: orphans.slice(0, listLimit)
  }
}

function buildTimeInsights(files: MediaDashboardFileItem[], range: RangePreset, oversizedThresholdBytes: number) {
  const now = new Date()
  const start = rangeStartDate(range, now)
  const rangeFiles = start
    ? files.filter(file => uploadedAtMs(file) >= start.getTime() && uploadedAtMs(file) <= now.getTime())
    : files
  const uploadedStorage = sum(rangeFiles, file => file.size)

  return {
    range,
    start: start?.toISOString() ?? null,
    end: now.toISOString(),
    uploaded_items: rangeFiles.length,
    uploaded_storage: uploadedStorage,
    average_uploaded_size: average(uploadedStorage, rangeFiles.length),
    oversized_images: rangeFiles.filter(file => file.type === 'image' && file.size > oversizedThresholdBytes).length,
    orphaned_uploads: rangeFiles.filter(file => file.reference_count === 0 && file.referenced_by_count === 0).length,
    by_type: buildTypeStats(rangeFiles)
  }
}

function rangeQuery(value: unknown): RangePreset {
  const raw = typeof value === 'string' ? value : ''
  return rangePresets.has(raw as RangePreset) ? raw as RangePreset : '30d'
}

function rangeStartDate(range: RangePreset, now: Date) {
  if (range === 'all') return null

  const start = new Date(now)
  if (range === 'today') {
    start.setHours(0, 0, 0, 0)
    return start
  }

  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
  start.setDate(start.getDate() - days + 1)
  start.setHours(0, 0, 0, 0)
  return start
}

function uploadedAtMs(file: MediaDashboardFileItem) {
  const timestamp = new Date(file.uploaded_at).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function sortBySizeThenName(a: MediaDashboardFileItem, b: MediaDashboardFileItem) {
  return b.size - a.size || a.name.localeCompare(b.name)
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function sum<T>(items: T[], select: (item: T) => number) {
  return items.reduce((total, item) => total + select(item), 0)
}

function average(total: number, count: number) {
  return count > 0 ? Math.round(total / count) : 0
}