import { queryDb, useDb } from './db'
import { queryRows } from './surrealResult'
import type { JsonContent } from '~/types/content'

export const PUBLIC_SETTING_KEYS = [
  'site_title',
  'site_subtitle',
  'site_logo',
  'site_banner',
  'site_favicon',
  'owner_name',
  'owner_avatar',
  'owner_motto',
  'owner_bio',
  'footer_copyright',
  'footer_links',
  'footer_social'
] as const

export type PublicSettingKey = typeof PUBLIC_SETTING_KEYS[number]

export interface SettingsLink {
  label: string
  url: string
  icon?: string
}

export interface PublicSiteSettings {
  site_title: string
  site_subtitle: string
  site_logo: string
  site_banner: string
  site_favicon: string
  owner_name: string
  owner_avatar: string
  owner_motto: string
  owner_bio: JsonContent | null
  footer_copyright: string
  footer_links: SettingsLink[]
  footer_social: SettingsLink[]
}

const publicSettingKeySet = new Set<string>(PUBLIC_SETTING_KEYS)

export async function readAppSettings(keys: readonly string[] = PUBLIC_SETTING_KEYS): Promise<Record<string, unknown>> {
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM app_setting;')
  const wanted = new Set(keys)
  const settings: Record<string, unknown> = {}

  for (const row of queryRows<Record<string, unknown>>(response)) {
    const key = String(row.key ?? '')
    if (wanted.has(key)) {
      settings[key] = row.value
    }
  }

  return settings
}

export async function writeAppSettings(values: Record<string, unknown>, keys: readonly string[] = PUBLIC_SETTING_KEYS): Promise<void> {
  const allowed = new Set(keys)
  const entries = Object.entries(values).filter(([key]) => allowed.has(key))

  if (!entries.length) {
    return
  }

  const db = await useDb()
  for (const [key, value] of entries) {
    await queryDb(
      db,
      `UPSERT type::record($table, $id) CONTENT {
        key: $key,
        value: $value,
        updated_at: time::now()
      };`,
      { table: 'app_setting', id: key, key, value }
    )
  }
}

export function filterPublicSettings(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => publicSettingKeySet.has(key))
  )
}

export function normalizePublicSettings(values: Record<string, unknown>): PublicSiteSettings {
  return {
    site_title: stringValue(values.site_title),
    site_subtitle: stringValue(values.site_subtitle),
    site_logo: stringValue(values.site_logo),
    site_banner: stringValue(values.site_banner),
    site_favicon: stringValue(values.site_favicon),
    owner_name: stringValue(values.owner_name),
    owner_avatar: stringValue(values.owner_avatar),
    owner_motto: stringValue(values.owner_motto),
    owner_bio: jsonContentValue(values.owner_bio),
    footer_copyright: stringValue(values.footer_copyright),
    footer_links: linksValue(values.footer_links),
    footer_social: linksValue(values.footer_social)
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function jsonContentValue(value: unknown): JsonContent | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const node = value as JsonContent
  return typeof node.type === 'string' ? node : null
}

function linksValue(value: unknown): SettingsLink[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const link = item as Record<string, unknown>
      const label = stringValue(link.label).trim()
      const url = safeUrl(stringValue(link.url).trim())
      const icon = stringValue(link.icon).trim()

      if (!label || !url) {
        return null
      }

      return icon ? { label, url, icon } : { label, url }
    })
    .filter((item): item is SettingsLink => Boolean(item))
}

function safeUrl(value: string) {
  if (
    value.startsWith('/') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('mailto:') ||
    value.startsWith('tel:')
  ) {
    return value
  }

  return ''
}

// ============ MEDIA SETTINGS ============

export interface MediaSettings {
  allowed_extensions: string[]
  max_file_size_mb: number
  max_files_per_upload: number
  enable_perceptual_dedup: boolean
  perceptual_dedup_threshold: number
  download_cleanup_hours: number
}

const DEFAULT_MEDIA_SETTINGS: MediaSettings = {
  allowed_extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'mp4', 'webm', 'mov', 'zip', 'rar', '7z'],
  max_file_size_mb: 10,
  max_files_per_upload: 5,
  enable_perceptual_dedup: false,
  perceptual_dedup_threshold: 5,
  download_cleanup_hours: 1
}

export async function getMediaSettings(): Promise<MediaSettings> {
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM app_setting WHERE key = $key LIMIT 1;', { key: 'media' })
  const rows = queryRows<Record<string, unknown>>(response)
  
  if (!rows || !rows.length) {
    return DEFAULT_MEDIA_SETTINGS
  }

  const row = rows[0]
  if (!row || !row.value || typeof row.value !== 'object') {
    return DEFAULT_MEDIA_SETTINGS
  }

  const settings = row.value as Record<string, unknown>
  return {
    allowed_extensions: Array.isArray(settings.allowed_extensions) ? settings.allowed_extensions as string[] : DEFAULT_MEDIA_SETTINGS.allowed_extensions,
    max_file_size_mb: typeof settings.max_file_size_mb === 'number' ? settings.max_file_size_mb : DEFAULT_MEDIA_SETTINGS.max_file_size_mb,
    max_files_per_upload: typeof settings.max_files_per_upload === 'number' ? settings.max_files_per_upload : DEFAULT_MEDIA_SETTINGS.max_files_per_upload,
    enable_perceptual_dedup: settings.enable_perceptual_dedup === false ? false : DEFAULT_MEDIA_SETTINGS.enable_perceptual_dedup,
    perceptual_dedup_threshold: typeof settings.perceptual_dedup_threshold === 'number' ? settings.perceptual_dedup_threshold : DEFAULT_MEDIA_SETTINGS.perceptual_dedup_threshold,
    download_cleanup_hours: typeof settings.download_cleanup_hours === 'number' ? settings.download_cleanup_hours : DEFAULT_MEDIA_SETTINGS.download_cleanup_hours
  }
}

export async function updateMediaSettings(settings: MediaSettings): Promise<void> {
  const db = await useDb()
  // Remove any legacy record with a different ID that holds key='media' (fixes unique index conflict)
  await queryDb(db, `DELETE FROM app_setting WHERE key = $key AND id != type::record($table, $id);`, {
    table: 'app_setting', id: 'media', key: 'media'
  })
  await queryDb(
    db,
    `UPSERT type::record($table, $id) CONTENT {
      key: $key,
      value: $value,
      updated_at: time::now()
    };`,
    { table: 'app_setting', id: 'media', key: 'media', value: settings }
  )
}
