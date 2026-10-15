/**
 * Pure helpers for the public post "Reader mode" panel: font size, serif/sans
 * family, light/sepia/dark appearance and line width. Values are local to the
 * browser (not an account/site setting) and only ever affect the post
 * reading frame, never the admin UI or the rest of the site.
 */

export type ReaderFontSize = 'sm' | 'md' | 'lg' | 'xl'
export type ReaderFontFamily = 'sans' | 'serif'
export type ReaderAppearance = 'auto' | 'light' | 'sepia' | 'dark'
export type ReaderLineWidth = 'narrow' | 'normal' | 'wide'

export interface ReaderPrefs {
  fontSize: ReaderFontSize
  fontFamily: ReaderFontFamily
  appearance: ReaderAppearance
  lineWidth: ReaderLineWidth
}

export const READER_PREFS_STORAGE_KEY = 'pb-reader-prefs'

export const READER_FONT_SIZES: readonly ReaderFontSize[] = ['sm', 'md', 'lg', 'xl']
export const READER_FONT_FAMILIES: readonly ReaderFontFamily[] = ['sans', 'serif']
export const READER_APPEARANCES: readonly ReaderAppearance[] = ['auto', 'light', 'sepia', 'dark']
export const READER_LINE_WIDTHS: readonly ReaderLineWidth[] = ['narrow', 'normal', 'wide']

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  fontSize: 'md',
  fontFamily: 'sans',
  appearance: 'auto',
  lineWidth: 'normal'
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

export function normalizeFontSize(value: unknown): ReaderFontSize | null {
  return isOneOf(value, READER_FONT_SIZES) ? value : null
}

export function normalizeFontFamily(value: unknown): ReaderFontFamily | null {
  return isOneOf(value, READER_FONT_FAMILIES) ? value : null
}

export function normalizeAppearance(value: unknown): ReaderAppearance | null {
  return isOneOf(value, READER_APPEARANCES) ? value : null
}

export function normalizeLineWidth(value: unknown): ReaderLineWidth | null {
  return isOneOf(value, READER_LINE_WIDTHS) ? value : null
}

/**
 * Merge a partial/untrusted record (e.g. parsed JSON from localStorage) onto
 * the defaults, dropping anything unrecognized instead of throwing.
 */
export function normalizeReaderPrefs(value: unknown): ReaderPrefs {
  const input = (value && typeof value === 'object') ? value as Record<string, unknown> : {}
  return {
    fontSize: normalizeFontSize(input.fontSize) ?? DEFAULT_READER_PREFS.fontSize,
    fontFamily: normalizeFontFamily(input.fontFamily) ?? DEFAULT_READER_PREFS.fontFamily,
    appearance: normalizeAppearance(input.appearance) ?? DEFAULT_READER_PREFS.appearance,
    lineWidth: normalizeLineWidth(input.lineWidth) ?? DEFAULT_READER_PREFS.lineWidth
  }
}

export function parseReaderPrefs(raw: string | null): ReaderPrefs {
  if (!raw) return { ...DEFAULT_READER_PREFS }
  try {
    return normalizeReaderPrefs(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_READER_PREFS }
  }
}

export function isDefaultReaderPrefs(prefs: ReaderPrefs): boolean {
  return READER_PREFS_KEYS.every(key => prefs[key] === DEFAULT_READER_PREFS[key])
}

const READER_PREFS_KEYS = ['fontSize', 'fontFamily', 'appearance', 'lineWidth'] as const

/** Step a cyclical option list forward/backward, wrapping at the ends. */
export function stepOption<T extends string>(options: readonly T[], current: T, delta: 1 | -1): T {
  const index = options.indexOf(current)
  const nextIndex = Math.min(options.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))
  return options[nextIndex] as T
}
