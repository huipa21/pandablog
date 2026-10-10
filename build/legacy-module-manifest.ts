import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * PandaBlog used to compile optional features in or out from this manifest.
 * Every feature is now always built; a leftover file only produces a warning.
 */
export const LEGACY_MODULE_MANIFEST = 'pandablog.modules.json'

const MAX_MANIFEST_BYTES = 256 * 1024
const MAX_DEPTH = 6
const MAX_REPORTED_PATHS = 100
/** Switches retired before this change; never reported. */
const IGNORED_PATHS = new Set(['modules.logs.accessLogs'])

/** Lists dotted paths whose value is exactly `false` (e.g. `modules.analytics.enabled`). */
export function listDisabledLegacyFlags(value: unknown, prefix = '', out: string[] = [], depth = 0): string[] {
  if (out.length >= MAX_REPORTED_PATHS || depth > MAX_DEPTH) return out
  if (value === false) {
    if (prefix && !IGNORED_PATHS.has(prefix)) out.push(prefix)
    return out
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!prefix && (key === '$schema' || key === 'version')) continue
    listDisabledLegacyFlags(child, prefix ? `${prefix}.${key}` : key, out, depth + 1)
  }
  return out
}

export type LegacyManifestReport =
  | { found: false }
  | { found: true, unreadable: boolean, disabled: string[] }

/** Never throws: the build must not fail because of a stale manifest. */
export function inspectLegacyModuleManifest(rootDir: string): LegacyManifestReport {
  const path = resolve(rootDir, LEGACY_MODULE_MANIFEST)
  if (!existsSync(path)) return { found: false }
  try {
    const text = readFileSync(path, 'utf8')
    if (text.length > MAX_MANIFEST_BYTES) return { found: true, unreadable: true, disabled: [] }
    return { found: true, unreadable: false, disabled: listDisabledLegacyFlags(JSON.parse(text)) }
  } catch {
    return { found: true, unreadable: true, disabled: [] }
  }
}

export function formatLegacyManifestWarning(report: Extract<LegacyManifestReport, { found: true }>): string {
  const lines = [`[pandablog] ${LEGACY_MODULE_MANIFEST} is no longer used. Every feature is built in and controlled from admin settings.`]
  if (report.unreadable) {
    lines.push('  The file could not be read as JSON; review it manually.')
  } else if (report.disabled.length) {
    lines.push('  Your manifest disabled:', ...report.disabled.map(path => `    - ${path}`))
    lines.push('  Review docs/feature-flags-simplification/operations.md before deploying this build.')
  }
  lines.push(`  Delete ${LEGACY_MODULE_MANIFEST} to silence this warning.`)
  return lines.join('\n')
}
