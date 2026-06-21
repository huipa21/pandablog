/**
 * Highlight colour system.
 *
 * A highlight stores a single theme-independent *seed* colour (`attrs.color`).
 * Its hue + saturation define the semantic identity; the light/dark background
 * and text colours are derived automatically from that hue so the SAME highlight
 * flips correctly when the reader toggles theme.
 *
 * Text colour is chosen by measuring WCAG relative-luminance contrast (not by
 * assuming dark-text-in-light / light-text-in-dark), and the background lightness
 * is nudged until the best candidate clears AA (4.5:1). This guarantees readable
 * contrast on every derived background.
 *
 * The editor (extensions/highlightEnhanced.ts) and the public renderer
 * (components/content/ContentText.vue) both emit the same four CSS custom
 * properties so the admin editor and published post render identically:
 *   --hl-bg / --hl-text           (light theme)
 *   --hl-bg-dark / --hl-text-dark (dark theme)
 */

export const DEFAULT_HIGHLIGHT_COLOR = 'hsl(50 90% 85%)'

/** Default value for the native `<input type="color">` picker (needs a hex). */
export const DEFAULT_HIGHLIGHT_PICKER_HEX = '#fde047'

/** Curated semantic highlight hues. One hue per meaning; variants are derived. */
export const CURATED_HIGHLIGHTS = [
  { label: 'Yellow', hue: 50, saturation: 90 },
  { label: 'Green', hue: 140, saturation: 60 },
  { label: 'Blue', hue: 210, saturation: 70 },
  { label: 'Purple', hue: 275, saturation: 60 },
  { label: 'Pink', hue: 330, saturation: 70 },
  { label: 'Orange', hue: 28, saturation: 85 }
] as const

const AA_NORMAL = 4.5

interface RGB {
  r: number
  g: number
  b: number
}

export interface HighlightTokens {
  /** The recovered hue (0-360). */
  hue: number
  bgLight: string
  textLight: string
  bgDark: string
  textDark: string
  /** Achieved contrast ratios (audit trail). */
  ratioLight: number
  ratioDark: number
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

// ── Colour parsing ───────────────────────────────────────────────────────────

const HEX_RE = /^#(?:[\da-f]{3}|[\da-f]{6})$/i
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+\s*)?\)$/i
const HSL_RE = /^hsla?\(\s*(\d{1,3}(?:\.\d+)?)\s*[, ]\s*(\d{1,3}(?:\.\d+)?)%\s*[, ]\s*(\d{1,3}(?:\.\d+)?)%\s*(?:[,/]\s*[\d.]+\s*)?\)$/i

function parseColorToRgb(input: string): RGB | null {
  const value = input.trim()

  if (HEX_RE.test(value)) {
    const raw = value.slice(1)
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16)
    }
  }

  const rgb = value.match(RGB_RE)
  if (rgb) {
    return {
      r: clamp(Number(rgb[1]), 0, 255),
      g: clamp(Number(rgb[2]), 0, 255),
      b: clamp(Number(rgb[3]), 0, 255)
    }
  }

  const hsl = value.match(HSL_RE)
  if (hsl) {
    return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]))
  }

  return null
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const sat = s / 100
  const lig = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return {
    r: Math.round(255 * f(0)),
    g: Math.round(255 * f(8)),
    b: Math.round(255 * f(4))
  }
}

function rgbToHsl({ r, g, b }: RGB): { h: number, s: number, l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2

  let h = 0
  let s = 0

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6
        break
      case gn:
        h = (bn - rn) / delta + 2
        break
      default:
        h = (rn - gn) / delta + 4
    }
    h *= 60
    if (h < 0) {
      h += 360
    }
  }

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

// ── WCAG contrast ────────────────────────────────────────────────────────────

function relativeLuminance({ r, g, b }: RGB): number {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

// ── Derivation ───────────────────────────────────────────────────────────────

type Theme = 'light' | 'dark'

function deriveHighlightTheme(hue: number, saturation: number, theme: Theme) {
  const darkText = hslToRgb(hue, 30, 17)
  const lightText = hslToRgb(hue, 25, 92)
  const darkTextCss = `hsl(${hue} 30% 17%)`
  const lightTextCss = `hsl(${hue} 25% 92%)`

  let bgL = theme === 'light' ? 85 : 28
  const dir = theme === 'light' ? -1 : 1
  const step = theme === 'light' ? 3 : 2

  for (let i = 0; i < 25; i++) {
    const bg = hslToRgb(hue, saturation, bgL)
    const darkRatio = contrastRatio(bg, darkText)
    const lightRatio = contrastRatio(bg, lightText)
    const useDark = darkRatio >= lightRatio
    const bestRatio = useDark ? darkRatio : lightRatio

    if (bestRatio >= AA_NORMAL) {
      return {
        bg: `hsl(${hue} ${saturation}% ${bgL}%)`,
        text: useDark ? darkTextCss : lightTextCss,
        ratio: Number(bestRatio.toFixed(2))
      }
    }

    bgL = clamp(bgL + dir * step, 0, 100)
  }

  // Fallback: pure black/white text guarantees maximum contrast.
  const bg = hslToRgb(hue, saturation, bgL)
  const blackRatio = contrastRatio(bg, { r: 0, g: 0, b: 0 })
  const whiteRatio = contrastRatio(bg, { r: 255, g: 255, b: 255 })
  const useBlack = blackRatio >= whiteRatio
  return {
    bg: `hsl(${hue} ${saturation}% ${bgL}%)`,
    text: useBlack ? 'hsl(0 0% 0%)' : 'hsl(0 0% 100%)',
    ratio: Number(Math.max(blackRatio, whiteRatio).toFixed(2))
  }
}

/**
 * Derive theme-adaptive, contrast-guaranteed light/dark tokens from any seed
 * colour (hex / rgb / hsl). Only the seed's hue + saturation are used; the
 * lightness is recomputed per theme.
 */
export function deriveHighlightTokens(seed: string): HighlightTokens {
  const rgb = parseColorToRgb(seed) ?? parseColorToRgb(DEFAULT_HIGHLIGHT_COLOR)!
  const { h, s } = rgbToHsl(rgb)

  const satLight = clamp(s, 40, 95)
  const satDark = clamp(Math.round(satLight * 0.55), 25, 60)

  const light = deriveHighlightTheme(h, satLight, 'light')
  const dark = deriveHighlightTheme(h, satDark, 'dark')

  return {
    hue: h,
    bgLight: light.bg,
    textLight: light.text,
    bgDark: dark.bg,
    textDark: dark.text,
    ratioLight: light.ratio,
    ratioDark: dark.ratio
  }
}

/** Style object (for Vue `:style`) exposing the four highlight CSS variables. */
export function highlightCssVars(seed: string): Record<string, string> {
  const t = deriveHighlightTokens(seed)
  return {
    '--hl-bg': t.bgLight,
    '--hl-text': t.textLight,
    '--hl-bg-dark': t.bgDark,
    '--hl-text-dark': t.textDark
  }
}

/** Inline style string (for TipTap `renderHTML`) exposing the highlight CSS variables. */
export function highlightStyleString(seed: string): string {
  const t = deriveHighlightTokens(seed)
  return `--hl-bg:${t.bgLight};--hl-text:${t.textLight};--hl-bg-dark:${t.bgDark};--hl-text-dark:${t.textDark}`
}

/** Curated swatch options for the toolbars: stored seed + light/dark previews. */
export function curatedHighlightOptions() {
  return CURATED_HIGHLIGHTS.map((c) => {
    const value = `hsl(${c.hue} ${c.saturation}% 85%)`
    const tokens = deriveHighlightTokens(value)
    return {
      label: c.label,
      value,
      light: tokens.bgLight,
      dark: tokens.bgDark
    }
  })
}

export function normalizeHighlightColor(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_HIGHLIGHT_COLOR
  }

  const color = value.trim()
  if (HEX_RE.test(color) || RGB_RE.test(color) || HSL_RE.test(color)) {
    return color
  }

  return DEFAULT_HIGHLIGHT_COLOR
}
