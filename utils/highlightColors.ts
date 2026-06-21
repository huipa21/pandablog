export const DEFAULT_HIGHLIGHT_COLOR = '#fef08a'

export const HIGHLIGHT_COLORS = [
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Purple', value: '#ddd6fe' },
  { label: 'Rose', value: '#fecdd3' },
  { label: 'Amber', value: '#fde68a' }
] as const

export const DARK_HIGHLIGHT_COLORS = [
  { label: 'Gold', value: 'rgb(133, 91, 16)' },
  { label: 'Moss', value: 'rgb(42, 104, 74)' },
  { label: 'Sky', value: 'rgb(37, 99, 145)' },
  { label: 'Violet', value: 'rgb(92, 72, 153)' },
  { label: 'Berry', value: 'rgb(139, 52, 86)' },
  { label: 'Copper', value: 'rgb(139, 74, 34)' }
] as const

const HIGHLIGHT_COLOR_SET = new Set<string>([
  ...HIGHLIGHT_COLORS,
  ...DARK_HIGHLIGHT_COLORS
].map((color) => color.value.toLowerCase()))

const HEX_COLOR_RE = /^#(?:[\da-f]{3}|[\da-f]{6})$/i

export function normalizeHighlightColor(value: unknown) {
  if (typeof value !== 'string') {
    return DEFAULT_HIGHLIGHT_COLOR
  }

  const color = value.trim().toLowerCase()
  return HIGHLIGHT_COLOR_SET.has(color) || HEX_COLOR_RE.test(color) ? color : DEFAULT_HIGHLIGHT_COLOR
}
