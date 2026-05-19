import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ThemeManifestSchema, ThemeTokensSchema, type ThemeManifest, type ThemeTokens } from './theme-validator'
import { queryDb, useDb } from './db'

const THEMES_DIR = 'themes'

export interface LoadedTheme {
  manifest: ThemeManifest
  tokens: ThemeTokens
  css: string
  /** Compiled CSS with :root { --color-bg: ...; } prepended, ready to serve */
  compiledCss: string
  /** mtime of the latest source file, for cache busting */
  version: number
}

const cache = new Map<string, LoadedTheme>()
let activeThemeIdCache: string | null = null
let activeThemeIdPromise: Promise<string> | null = null

/**
 * Convert a token group to CSS custom property declarations.
 * { color: { bg: '#fff' } } → '--color-bg: #fff;'
 */
function tokensToCss(group: Record<string, Record<string, string>>): string {
  const lines: string[] = []
  for (const [category, tokens] of Object.entries(group)) {
    for (const [name, value] of Object.entries(tokens)) {
      lines.push(`  --${category}-${name}: ${value};`)
    }
  }
  return lines.join('\n')
}

/**
 * Load a theme from disk. Caches by theme id + mtime.
 */
export async function loadTheme(themeId: string): Promise<LoadedTheme | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(themeId)) return null

  const dir = join(THEMES_DIR, themeId)
  if (!existsSync(dir)) return null

  // Check mtime for cache invalidation
  const dirStat = await stat(dir)
  const cached = cache.get(themeId)
  if (cached && cached.version === dirStat.mtimeMs) return cached

  try {
    const manifestRaw = await readFile(join(dir, 'theme.json'), 'utf8')
    const manifest = ThemeManifestSchema.parse(JSON.parse(manifestRaw))

    const tokensRaw = await readFile(join(dir, manifest.tokens), 'utf8')
    const tokens = ThemeTokensSchema.parse(JSON.parse(tokensRaw))

    const css = await readFile(join(dir, manifest.css), 'utf8')

    // Compile: :root vars (light) + [data-theme=dark] vars + theme CSS
    const lightVars = tokensToCss(tokens.light as any)
    const darkVars = tokensToCss(tokens.dark as any)
    const layoutVar = `  --layout-max-content: ${manifest.layout.maxContentWidth};`

    const compiledCss = [
      `/* Theme: ${manifest.name} v${manifest.version} */`,
      `:root {`,
      lightVars,
      layoutVar,
      `}`,
      `[data-theme="dark"] {`,
      darkVars,
      `}`,
      `@media (prefers-color-scheme: dark) {`,
      `  :root:not([data-theme="light"]) {`,
      darkVars,
      `  }`,
      `}`,
      css
    ].join('\n')

    const loaded: LoadedTheme = { manifest, tokens, css, compiledCss, version: dirStat.mtimeMs }
    cache.set(themeId, loaded)
    return loaded
  } catch (err) {
    console.error(`[theme-loader] Failed to load theme "${themeId}":`, err)
    return null
  }
}

/**
 * List all themes by reading the themes directory.
 */
export async function listThemes(): Promise<ThemeManifest[]> {
  if (!existsSync(THEMES_DIR)) return []

  const dirs = await readdir(THEMES_DIR, { withFileTypes: true })
  const themes: ThemeManifest[] = []

  for (const dirent of dirs) {
    if (!dirent.isDirectory()) continue
    const loaded = await loadTheme(dirent.name)
    if (loaded) themes.push(loaded.manifest)
  }

  return themes
}

/**
 * Clear the cache — call after install/delete/activate.
 */
export function invalidateThemeCache(themeId?: string) {
  if (themeId) cache.delete(themeId)
  else cache.clear()

  activeThemeIdCache = null
  activeThemeIdPromise = null
}

/**
 * Get the active theme id from app_setting, falling back to "default".
 */
export async function getActiveThemeId(): Promise<string> {
  if (activeThemeIdCache) {
    return activeThemeIdCache
  }

  if (!activeThemeIdPromise) {
    activeThemeIdPromise = readActiveThemeId().finally(() => {
      activeThemeIdPromise = null
    })
  }

  const themeId = await activeThemeIdPromise
  activeThemeIdCache = themeId
  return themeId
}

export async function setActiveThemeId(themeId: string): Promise<void> {
  const db = await useDb()
  await queryDb(
    db,
    `UPSERT app_setting:active_theme CONTENT { key: 'active_theme', value: $id }`,
    { id: themeId }
  )

  activeThemeIdCache = themeId
  activeThemeIdPromise = null
}

async function readActiveThemeId(): Promise<string> {
  try {
    const db = await useDb()
    const result = await queryDb<[Array<{ value: string }> ]>(
      db,
      `SELECT * FROM app_setting WHERE key = 'active_theme' LIMIT 1`
    )
    const row = result[0]?.[0]
    return row?.value ?? 'default'
  } catch {
    return activeThemeIdCache ?? 'default'
  }
}
