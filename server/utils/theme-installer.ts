import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import AdmZip from 'adm-zip'
import { ThemeManifestSchema, ThemeTokensSchema, validateCss } from './theme-validator'

const THEMES_DIR = 'themes'
const MAX_ZIP_SIZE = 5 * 1024 * 1024       // 5 MB
const MAX_FILE_COUNT = 50
const ALLOWED_EXTENSIONS = new Set(['.json', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.md', '.txt'])

export interface InstallResult {
  ok: boolean
  themeId?: string
  error?: string
}

/**
 * Install a theme from an in-memory zip buffer.
 * Performs strict validation: path traversal, manifest schema, token schema, CSS sanitization.
 * Refuses to overwrite an existing theme directory.
 */
export async function installThemeFromZip(zipBuffer: Buffer): Promise<InstallResult> {
  if (zipBuffer.length > MAX_ZIP_SIZE) {
    return { ok: false, error: `Zip exceeds ${MAX_ZIP_SIZE} bytes` }
  }

  let zip: AdmZip
  try {
    zip = new AdmZip(zipBuffer)
  } catch {
    return { ok: false, error: 'Invalid zip file' }
  }

  const entries = zip.getEntries()
  if (entries.length === 0) return { ok: false, error: 'Empty zip' }
  if (entries.length > MAX_FILE_COUNT) return { ok: false, error: `Too many files (>${MAX_FILE_COUNT})` }

  // 1. Find theme.json — accept either at root or under a single top-level folder
  const manifestEntry = entries.find(e => /^([^/]+\/)?theme\.json$/i.test(e.entryName))
  if (!manifestEntry) return { ok: false, error: 'theme.json not found at root or single top-level folder' }

  // Determine the prefix (top-level folder, if any)
  const prefixMatch = manifestEntry.entryName.match(/^([^/]+\/)?theme\.json$/i)
  const prefix = prefixMatch?.[1] ?? ''

  // 2. Parse manifest
  let manifest
  try {
    const raw = manifestEntry.getData().toString('utf8')
    const parsed = JSON.parse(raw)
    manifest = ThemeManifestSchema.parse(parsed)
  } catch (err: any) {
    return { ok: false, error: `Invalid theme.json: ${err.message ?? err}` }
  }

  if (manifest.id === 'default') {
    return { ok: false, error: 'Cannot install a theme with reserved id "default"' }
  }

  // 3. Verify destination doesn't exist
  const destDir = join(THEMES_DIR, manifest.id)
  if (existsSync(destDir)) {
    return { ok: false, error: `Theme "${manifest.id}" already exists. Delete it first to reinstall.` }
  }

  // 4. Validate referenced files exist + path safety on every entry
  const requiredFiles = [manifest.tokens, manifest.css, manifest.preview]
  const filesByRelative = new Map<string, AdmZip.IZipEntry>()

  for (const entry of entries) {
    if (entry.isDirectory) continue

    // Strip prefix
    const relative = entry.entryName.startsWith(prefix) ? entry.entryName.slice(prefix.length) : entry.entryName
    if (!relative) continue

    // Path traversal check: normalize and ensure it stays within
    const normalized = normalize(relative).replace(/\\/g, '/')
    if (normalized.startsWith('../') || normalized.startsWith('/') || normalized.includes('..' + sep)) {
      return { ok: false, error: `Unsafe path in zip: ${entry.entryName}` }
    }

    // Extension allowlist
    const ext = normalized.slice(normalized.lastIndexOf('.')).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return { ok: false, error: `Disallowed file type: ${normalized}` }
    }

    // Size guard per file
    if (entry.header.size > 1_000_000) {
      return { ok: false, error: `File too large: ${normalized}` }
    }

    filesByRelative.set(normalized, entry)
  }

  for (const required of requiredFiles) {
    if (!filesByRelative.has(required)) {
      return { ok: false, error: `Manifest references missing file: ${required}` }
    }
  }

  // 5. Validate tokens.json
  try {
    const tokensRaw = filesByRelative.get(manifest.tokens)!.getData().toString('utf8')
    ThemeTokensSchema.parse(JSON.parse(tokensRaw))
  } catch (err: any) {
    return { ok: false, error: `Invalid tokens file: ${err.message ?? err}` }
  }

  // 6. Validate CSS
  const cssContent = filesByRelative.get(manifest.css)!.getData().toString('utf8')
  const cssCheck = validateCss(cssContent)
  if (!cssCheck.ok) {
    return { ok: false, error: `CSS validation failed: ${cssCheck.reason}` }
  }

  // 7. All checks passed — write to disk
  await mkdir(destDir, { recursive: true })
  for (const [relative, entry] of filesByRelative.entries()) {
    const destFile = join(destDir, relative)
    const destFileDir = destFile.substring(0, destFile.lastIndexOf(sep))
    if (destFileDir && destFileDir !== destDir) {
      await mkdir(destFileDir, { recursive: true })
    }
    await writeFile(destFile, entry.getData())
  }

  return { ok: true, themeId: manifest.id }
}

/**
 * Delete a theme directory. Refuses to delete "default".
 */
export async function deleteTheme(themeId: string): Promise<{ ok: boolean, error?: string }> {
  if (themeId === 'default') return { ok: false, error: 'Cannot delete the default theme' }
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(themeId)) return { ok: false, error: 'Invalid theme id' }

  const dir = join(THEMES_DIR, themeId)
  if (!existsSync(dir)) return { ok: false, error: 'Theme not found' }

  const dirStat = await stat(dir)
  if (!dirStat.isDirectory()) return { ok: false, error: 'Not a directory' }

  await rm(dir, { recursive: true, force: true })
  return { ok: true }
}
