import type { JsonContent } from '~/types/content'

export const IMAGE_PRESETS = ['small', 'medium', 'full'] as const
export const LAYOUT_PRESETS = ['equal', 'wider-left', 'wider-right'] as const
export type ImagePreset = typeof IMAGE_PRESETS[number]
export type LayoutPreset = typeof LAYOUT_PRESETS[number]

export function imagePreset(value: unknown): ImagePreset {
  return IMAGE_PRESETS.includes(value as ImagePreset) ? value as ImagePreset : 'full'
}
export function layoutPreset(value: unknown, count = 2): LayoutPreset {
  return count === 2 && LAYOUT_PRESETS.includes(value as LayoutPreset) ? value as LayoutPreset : 'equal'
}
export function layoutWeights(value: unknown, count = 2): number[] {
  const preset = layoutPreset(value, count)
  return preset === 'wider-left' ? [2, 1] : preset === 'wider-right' ? [1, 2] : Array.from({ length: count }, () => 1)
}
export function mediaFraction(value: unknown, position: unknown): number {
  const weights = layoutWeights(value)
  return weights[position === 'right' ? 1 : 0]! / (weights[0]! + weights[1]!)
}
function positive(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}
function nearestImage(percent: number): ImagePreset {
  const widths = [100 / 3, 200 / 3, 100]
  let index = 2, distance = Infinity
  widths.forEach((width, i) => {
    const next = Math.abs(width - percent)
    if (next <= distance + 1e-8) { index = i; distance = next }
  })
  return IMAGE_PRESETS[index]!
}
export function importedImagePreset(attrs: Record<string, unknown>, media = false): ImagePreset {
  const key = media ? 'mediaSizePreset' : 'sizePreset'
  if (Object.prototype.hasOwnProperty.call(attrs, key)) return imagePreset(attrs[key])
  const mode = attrs[media ? 'mediaDisplaySize' : 'displaySize']
  if (mode && mode !== 'custom-percent') return 'full'
  const percent = (mode === 'custom-percent' ? positive(attrs[media ? 'mediaDisplayPercent' : 'displayPercent']) : null)
    ?? positive(attrs[media ? 'mediaWidthPercent' : 'widthPercent'])
  return percent ? nearestImage(Math.max(1, Math.min(200, percent))) : 'full'
}
function nearestLayout(left: number): LayoutPreset {
  const choices: Array<[LayoutPreset, number]> = [['equal', 0.5], ['wider-left', 2 / 3], ['wider-right', 1 / 3]]
  let best: LayoutPreset = 'equal', distance = Infinity
  for (const [preset, fraction] of choices) {
    const next = Math.abs(fraction - left)
    if (next < distance - 1e-8) { best = preset; distance = next }
  }
  return best
}
export function importedLayoutPreset(attrs: Record<string, unknown>, count = 2, media = false): LayoutPreset {
  if (Object.prototype.hasOwnProperty.call(attrs, 'layoutPreset')) return layoutPreset(attrs.layoutPreset, count)
  if (count !== 2) return 'equal'
  if (media) {
    const ratio = positive(attrs.ratio)
    return ratio && ratio < 1 ? nearestLayout(attrs.mediaPosition === 'right' ? 1 - ratio : ratio) : 'equal'
  }
  const custom = String(attrs.customPercentages ?? '').split(',').map(positive)
  if (custom.length === 2 && custom.every(n => n !== null && n < 100) && Math.abs(custom[0]! + custom[1]! - 100) <= 0.1) return nearestLayout(custom[0]! / 100)
  const weights = String(attrs.proportions ?? '').split('-').map(positive)
  return weights.length === 2 && weights.every(n => n !== null) ? nearestLayout(weights[0]! / (weights[0]! + weights[1]!)) : 'equal'
}
const retired: Record<string, readonly string[]> = {
  image: ['sourceSize', 'displaySize', 'displayPercent', 'displayPx', 'width', 'height', 'widthPercent', 'lockAspect'],
  mediaText: ['mediaSourceSize', 'mediaDisplaySize', 'mediaDisplayPercent', 'mediaDisplayPx', 'mediaWidth', 'mediaHeight', 'mediaWidthPercent', 'lockAspect', 'ratio'],
  columnsBlock: ['proportions', 'customPercentages', 'columnGap', 'marginTop', 'marginBottom'],
  blockquote: ['theme', 'fontFamily', 'fontSize', 'fontColor', 'backgroundColor'],
  codeBlock: ['theme', 'zoom'],
  blockMath: ['theme', 'paddingX', 'paddingY', 'fontSize', 'fontFamily'],
  tabsBlock: ['tabStyle'],
  accordionBlock: ['paneStyle', 'triggerIcon', 'marginTop', 'marginBottom'],
  dialogueBlock: ['marginTop', 'marginBottom'],
  horizontalRule: ['color', 'thickness', 'marginY']
}
/** Pure import/render boundary. Never writes, drops children or mutates history. */
export function normalizePresentationNode<T extends JsonContent | null | undefined>(doc: T): T {
  if (!doc) return doc
  const out: JsonContent = { ...doc }
  const keys = retired[String(doc.type)]
  if (keys) {
    const attrs = { ...(doc.attrs ?? {}) }
    if (doc.type === 'image') attrs.sizePreset = importedImagePreset(attrs)
    if (doc.type === 'mediaText') {
      attrs.mediaSizePreset = importedImagePreset(attrs, true)
      attrs.layoutPreset = importedLayoutPreset(attrs, 2, true)
    }
    if (doc.type === 'columnsBlock') {
      const children = doc.content?.filter(child => child.type === 'columnItem').length
      attrs.layoutPreset = importedLayoutPreset(attrs, children || positive(attrs.columns) || 2)
    }
    if (doc.type === 'blockquote') attrs.style = attrs.style === 'marks' ? 'marks' : 'bar'
    out.attrs = Object.fromEntries(Object.entries(attrs).filter(([key]) => !keys.includes(key)))
  }
  return out as T
}
export function normalizeBlockPresentation<T extends JsonContent | null | undefined>(doc: T): T {
  if (!doc) return doc
  const out = normalizePresentationNode(doc)
  if (Array.isArray(doc.content)) out.content = doc.content.map(child => normalizeBlockPresentation(child))
  return out
}
/** Used by schema parsers before legacy HTML attrs are discarded. */
export function presentationHtmlAttrs(el: HTMLElement): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  for (const name of ['sizePreset', 'mediaSizePreset', 'displaySize', 'displayPercent', 'widthPercent', 'mediaDisplaySize', 'mediaDisplayPercent', 'mediaWidthPercent', 'layoutPreset', 'proportions', 'customPercentages', 'ratio', 'mediaPosition']) {
    const value = el.getAttribute(`data-${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`)
    if (value !== null) attrs[name] = value
  }
  return attrs
}
