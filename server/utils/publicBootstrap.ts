import { queryDb, useDb } from './db'
import { normalizePublicSettings, type PublicSiteSettings } from './settings'
import { queryRows, stringifyRecordId } from './surrealResult'
import { normalizeCategory, normalizeTag } from './taxonomy'
import { loadTheme } from './theme-loader'
import type { ThemeManifest } from './theme-validator'
import type { CategoryRecord, TagRecord } from '~/types/content'

const CACHE_TTL_MS = 30_000

type PublicThemeInfo = Pick<ThemeManifest, 'id' | 'name' | 'version' | 'layout' | 'supports'>

interface PublicBootstrapPayload {
  settings: PublicSiteSettings
  tags: TagRecord[]
  categories: CategoryRecord[]
  theme: PublicThemeInfo | null
}

let cachedPayload: PublicBootstrapPayload | null = null
let cachedAt = 0
let cachedPromise: Promise<PublicBootstrapPayload> | null = null

export async function readPublicBootstrap() {
  const now = Date.now()

  if (cachedPayload && now - cachedAt < CACHE_TTL_MS) {
    return cachedPayload
  }

  if (!cachedPromise) {
    cachedPromise = loadPublicBootstrap()
      .then((payload) => {
        cachedPayload = payload
        cachedAt = Date.now()
        return payload
      })
      .catch((error) => {
        if (cachedPayload) {
          return cachedPayload
        }

        throw error
      })
      .finally(() => {
        cachedPromise = null
      })
  }

  return cachedPromise
}

export function invalidatePublicBootstrapCache() {
  cachedPayload = null
  cachedAt = 0
  cachedPromise = null
}

async function loadPublicBootstrap(): Promise<PublicBootstrapPayload> {
  const db = await useDb()
  const response = await queryDb(
    db,
    `SELECT * FROM app_settings;
     SELECT * FROM tag ORDER BY name ASC;
     SELECT out, count() AS total FROM tagged WHERE in.status = 'published' GROUP BY out;
     SELECT * FROM category ORDER BY name ASC;
     SELECT out, count() AS total FROM categorized_as WHERE in.status = 'published' GROUP BY out;`,
    undefined,
    { label: 'public bootstrap' }
  )

  const settingsEntries = queryRows<Record<string, unknown>>(response, 0)
    .map((row) => [String(row.key ?? ''), row.value] as const)
    .filter(([key]) => Boolean(key))
  const settings = Object.fromEntries(settingsEntries)

  const tagCounts = new Map(
    queryRows<Record<string, unknown>>(response, 2)
      .map((row) => [stringifyRecordId(row.out), Number(row.total ?? 0)] as const)
  )
  const categoryCounts = new Map(
    queryRows<Record<string, unknown>>(response, 4)
      .map((row) => [stringifyRecordId(row.out), Number(row.total ?? 0)] as const)
  )

  const tags = queryRows<Record<string, unknown>>(response, 1)
    .map((tag) => normalizeTag({
      ...tag,
      post_count: tagCounts.get(stringifyRecordId(tag.id)) ?? 0
    }))

  const categories = queryRows<Record<string, unknown>>(response, 3)
    .map((category) => normalizeCategory({
      ...category,
      post_count: categoryCounts.get(stringifyRecordId(category.id)) ?? 0
    }))
    .filter((category) => (category.post_count ?? 0) > 0)

  const activeThemeId = typeof settings.active_theme === 'string' ? settings.active_theme : 'default'
  const theme = await resolveTheme(activeThemeId)

  return {
    settings: normalizePublicSettings(settings),
    tags,
    categories,
    theme
  }
}

async function resolveTheme(themeId: string): Promise<PublicThemeInfo | null> {
  const loadedTheme = await loadTheme(themeId) ?? await loadTheme('default')

  if (!loadedTheme) {
    return null
  }

  return {
    id: loadedTheme.manifest.id,
    name: loadedTheme.manifest.name,
    version: loadedTheme.manifest.version,
    layout: loadedTheme.manifest.layout,
    supports: loadedTheme.manifest.supports
  }
}