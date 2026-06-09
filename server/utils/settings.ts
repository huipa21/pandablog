import { queryDb, useDb } from './db'
import { queryRows } from './surrealResult'
import { createUserWithPasswordHash, findUserByUsername, setUserPasswordHash, updateUser } from './users'
import type { JsonContent } from '~/types/content'
import { ADMIN_COLOR_MODE_KEY, normalizeThemeMode, type ThemeMode } from '~/utils/themeMode'

export const PUBLIC_SETTING_KEYS = [
  'site_title',
  'site_subtitle',
  'site_logo',
  'site_banner',
  'site_banner_position_x',
  'site_banner_position_y',
  'site_banner_zoom',
  'site_hero_height_vh',
  'site_favicon',
  'owner_name',
  'owner_avatar',
  'owner_motto',
  'owner_bio',
  'owner_bio_visible',
  'footer_copyright',
  'footer_links',
  'footer_social',
  'footer_filings'
] as const

export const RUNTIME_SETTING_KEYS = [
  'trust_proxy_headers'
] as const

const ADMIN_ONLY_SETTING_KEYS = [
  ADMIN_COLOR_MODE_KEY
] as const

export const ADMIN_SETTING_KEYS = [
  ...PUBLIC_SETTING_KEYS,
  ...RUNTIME_SETTING_KEYS,
  ...ADMIN_ONLY_SETTING_KEYS
] as const

const SECRET_SETTING_KEYS = [
  'admin_password_hash'
] as const

export const ADMIN_USERNAME = 'admin'
const ADMIN_USERNAME_KEY = 'admin_username'
const ADMIN_PASSWORD_HASH_KEY = 'admin_password_hash'
const SETUP_COMPLETED_KEY = 'setup_completed'

export type PublicSettingKey = typeof PUBLIC_SETTING_KEYS[number]
export type RuntimeSettingKey = typeof RUNTIME_SETTING_KEYS[number]
export type ThemeModeSetting = ThemeMode

export interface RuntimeFlags {
  trust_proxy_headers: boolean
}

export interface AdminCredentials {
  username: typeof ADMIN_USERNAME
  passwordHash: string
  setupCompleted: boolean
}

const APP_SETTINGS_TABLE = 'app_settings'
const DEFAULT_RUNTIME_FLAGS: RuntimeFlags = {
  trust_proxy_headers: process.env.NODE_ENV === 'production'
}

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
  site_banner_position_x: number
  site_banner_position_y: number
  site_banner_zoom: number
  site_hero_height_vh: number
  site_favicon: string
  owner_name: string
  owner_avatar: string
  owner_motto: string
  owner_bio: JsonContent | null
  owner_bio_visible: boolean
  footer_copyright: string
  footer_links: SettingsLink[]
  footer_social: SettingsLink[]
  footer_filings: SettingsLink[]
}

const publicSettingKeySet = new Set<string>(PUBLIC_SETTING_KEYS)
const runtimeSettingKeySet = new Set<string>(RUNTIME_SETTING_KEYS)
const secretSettingKeySet = new Set<string>(SECRET_SETTING_KEYS)

let runtimeFlagsCache: RuntimeFlags = { ...DEFAULT_RUNTIME_FLAGS }

async function readRawAppSettings(keys: readonly string[]): Promise<Record<string, unknown>> {
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM app_settings;')
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

export async function readAppSettings(keys: readonly string[] = PUBLIC_SETTING_KEYS): Promise<Record<string, unknown>> {
  const settings = await readRawAppSettings(keys)
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !secretSettingKeySet.has(key))
  )
}

export async function writeAppSettings(values: Record<string, unknown>, keys: readonly string[] = PUBLIC_SETTING_KEYS): Promise<void> {
  const allowed = new Set(keys)
  const entries = Object.entries(values).filter(([key]) => allowed.has(key))

  if (!entries.length) {
    return
  }

  const db = await useDb()
  for (const [key, value] of entries) {
    await upsertAppSetting(db, key, value)
  }

  if (entries.some(([key]) => runtimeSettingKeySet.has(key))) {
    await initializeRuntimeSettings()
  }
}

async function upsertAppSetting(db: Awaited<ReturnType<typeof useDb>>, key: string, value: unknown): Promise<void> {
  const updated = await queryDb(
    db,
    `UPDATE app_settings SET
      value = $value,
      updated_at = time::now()
    WHERE key = $key;`,
    { key, value }
  )

  if (queryRows(updated).length) {
    return
  }

  await queryDb(
    db,
    `UPSERT type::record($table, $id) CONTENT {
      key: $key,
      value: $value,
      updated_at: time::now()
    };`,
    { table: APP_SETTINGS_TABLE, id: key, key, value }
  )
}

export function filterPublicSettings(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => publicSettingKeySet.has(key))
  )
}

export function filterAdminSettings(values: Record<string, unknown>) {
  const allowed = new Set<string>(ADMIN_SETTING_KEYS)
  const filtered = Object.fromEntries(
    Object.entries(values).filter(([key]) => allowed.has(key))
  )

  if (ADMIN_COLOR_MODE_KEY in filtered) {
    const colorMode = normalizeAdminColorMode(filtered[ADMIN_COLOR_MODE_KEY])
    if (colorMode) {
      filtered[ADMIN_COLOR_MODE_KEY] = colorMode
    } else {
      return Object.fromEntries(
        Object.entries(filtered).filter(([key]) => key !== ADMIN_COLOR_MODE_KEY)
      )
    }
  }

  return filtered
}

export function getRuntimeFlags(): RuntimeFlags {
  return runtimeFlagsCache
}

export async function initializeRuntimeSettings(seedDefaults = false): Promise<RuntimeFlags> {
  const settings = await readRawAppSettings(RUNTIME_SETTING_KEYS)

  if (seedDefaults) {
    const missingEntries = Object.entries(DEFAULT_RUNTIME_FLAGS).filter(([key]) => !(key in settings))
    if (missingEntries.length) {
      const db = await useDb()
      for (const [key, value] of missingEntries) {
        await upsertAppSetting(db, key, value)
        settings[key] = value
      }
    }
  }

  runtimeFlagsCache = normalizeRuntimeFlags(settings)
  return runtimeFlagsCache
}

export async function readAdminCredentials(): Promise<AdminCredentials> {
  const adminUser = await findUserByUsername(ADMIN_USERNAME).catch(() => null)
  if (adminUser?.password_hash && adminUser.active) {
    return {
      username: ADMIN_USERNAME,
      passwordHash: adminUser.password_hash,
      setupCompleted: true
    }
  }

  const settings = await readRawAppSettings([ADMIN_PASSWORD_HASH_KEY, SETUP_COMPLETED_KEY])
  const passwordHash = stringValue(settings[ADMIN_PASSWORD_HASH_KEY])

  return {
    username: ADMIN_USERNAME,
    passwordHash,
    setupCompleted: settings[SETUP_COMPLETED_KEY] === true && Boolean(passwordHash)
  }
}

export async function writeAdminCredentials(passwordHash: string): Promise<AdminCredentials> {
  const db = await useDb()
  const existing = await findUserByUsername(ADMIN_USERNAME).catch(() => null)
  if (existing) {
    await setUserPasswordHash(existing.id, passwordHash)
    await updateUser(existing.id, {
      role: 'superadmin',
      display_name: existing.display_name || 'Administrator',
      active: true
    })
  } else {
    await createUserWithPasswordHash({
      username: ADMIN_USERNAME,
      password_hash: passwordHash,
      role: 'superadmin',
      display_name: 'Administrator',
      active: true
    })
  }

  await upsertAppSetting(db, ADMIN_USERNAME_KEY, ADMIN_USERNAME)
  await upsertAppSetting(db, ADMIN_PASSWORD_HASH_KEY, passwordHash)
  await upsertAppSetting(db, SETUP_COMPLETED_KEY, true)
  return readAdminCredentials()
}

export async function isSetupCompleted(): Promise<boolean> {
  return (await readAdminCredentials()).setupCompleted
}

function normalizeRuntimeFlags(values: Record<string, unknown>): RuntimeFlags {
  return {
    trust_proxy_headers: booleanValue(values.trust_proxy_headers, DEFAULT_RUNTIME_FLAGS.trust_proxy_headers)
  }
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeAdminColorMode(value: unknown): ThemeModeSetting | null {
  return normalizeThemeMode(value)
}

export function normalizePublicSettings(values: Record<string, unknown>): PublicSiteSettings {
  return {
    site_title: stringValue(values.site_title),
    site_subtitle: stringValue(values.site_subtitle),
    site_logo: stringValue(values.site_logo),
    site_banner: stringValue(values.site_banner),
    site_banner_position_x: numberValue(values.site_banner_position_x, 50, 0, 100),
    site_banner_position_y: numberValue(values.site_banner_position_y, 50, 0, 100),
    site_banner_zoom: numberValue(values.site_banner_zoom, 100, 100, 200),
    site_hero_height_vh: numberValue(values.site_hero_height_vh, 34, 18, 58),
    site_favicon: stringValue(values.site_favicon),
    owner_name: stringValue(values.owner_name),
    owner_avatar: stringValue(values.owner_avatar),
    owner_motto: stringValue(values.owner_motto),
    owner_bio: jsonContentValue(values.owner_bio),
    owner_bio_visible: booleanValue(values.owner_bio_visible, true),
    footer_copyright: stringValue(values.footer_copyright),
    footer_links: linksValue(values.footer_links),
    footer_social: linksValue(values.footer_social),
    footer_filings: linksValue(values.footer_filings)
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(max, Math.max(min, number))
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
  public_base_url: string
  local_only: boolean
  orphan_cleanup_enabled: boolean
  orphan_cleanup_days: number
  orphan_cleanup_cron: string
}

const DEFAULT_MEDIA_SETTINGS: MediaSettings = {
  allowed_extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'mp4', 'webm', 'mov', 'zip', 'rar', '7z'],
  max_file_size_mb: 10,
  max_files_per_upload: 5,
  enable_perceptual_dedup: false,
  perceptual_dedup_threshold: 5,
  download_cleanup_hours: 1,
  public_base_url: '',
  local_only: false,
  orphan_cleanup_enabled: false,
  orphan_cleanup_days: 30,
  orphan_cleanup_cron: '0 4 * * *'
}

export async function getMediaSettings(): Promise<MediaSettings> {
  const db = await useDb()
  const response = await queryDb(db, 'SELECT * FROM app_settings WHERE key = $key LIMIT 1;', { key: 'media' })
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
    enable_perceptual_dedup: typeof settings.enable_perceptual_dedup === 'boolean' ? settings.enable_perceptual_dedup : DEFAULT_MEDIA_SETTINGS.enable_perceptual_dedup,
    perceptual_dedup_threshold: typeof settings.perceptual_dedup_threshold === 'number' ? settings.perceptual_dedup_threshold : DEFAULT_MEDIA_SETTINGS.perceptual_dedup_threshold,
    download_cleanup_hours: typeof settings.download_cleanup_hours === 'number' ? settings.download_cleanup_hours : DEFAULT_MEDIA_SETTINGS.download_cleanup_hours,
    public_base_url: stringValue(settings.public_base_url).replace(/\/+$/, ''),
    local_only: settings.local_only === true,
    orphan_cleanup_enabled: settings.orphan_cleanup_enabled === true,
    orphan_cleanup_days: typeof settings.orphan_cleanup_days === 'number' ? settings.orphan_cleanup_days : DEFAULT_MEDIA_SETTINGS.orphan_cleanup_days,
    orphan_cleanup_cron: stringValue(settings.orphan_cleanup_cron) || DEFAULT_MEDIA_SETTINGS.orphan_cleanup_cron
  }
}

export async function updateMediaSettings(settings: MediaSettings): Promise<void> {
  const db = await useDb()
  // Remove any legacy record with a different ID that holds key='media' (fixes unique index conflict)
  await queryDb(db, `DELETE FROM app_settings WHERE key = $key AND id != type::record($table, $id);`, {
    table: APP_SETTINGS_TABLE, id: 'media', key: 'media'
  })
  await queryDb(
    db,
    `UPSERT type::record($table, $id) CONTENT {
      key: $key,
      value: $value,
      updated_at: time::now()
    };`,
    { table: APP_SETTINGS_TABLE, id: 'media', key: 'media', value: settings }
  )
}
