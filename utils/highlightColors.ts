export const DEFAULT_HIGHLIGHT_COLOR = '#fef08a'

export const HIGHLIGHT_COLORS = [
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Purple', value: '#ddd6fe' },
  { label: 'Rose', value: '#fecdd3' },
  { label: 'Amber', value: '#fde68a' }
] as const

const HIGHLIGHT_COLOR_SET = new Set<string>(HIGHLIGHT_COLORS.map((color) => color.value.toLowerCase()))

export function normalizeHighlightColor(value: unknown) {
  if (typeof value !== 'string') {
    return DEFAULT_HIGHLIGHT_COLOR
  }

  const color = value.trim().toLowerCase()
  return HIGHLIGHT_COLOR_SET.has(color) ? color : DEFAULT_HIGHLIGHT_COLOR
}
