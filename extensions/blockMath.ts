import { InputRule, mergeAttributes, Node } from '@tiptap/core'

export const DEFAULT_BLOCK_MATH_THEME = 'none'
export const DEFAULT_BLOCK_MATH_ALIGN = 'center'
export const DEFAULT_BLOCK_MATH_PADDING_X = 16
export const DEFAULT_BLOCK_MATH_PADDING_Y = 16
export const DEFAULT_BLOCK_MATH_FONT_SIZE = 1.15
export const DEFAULT_BLOCK_MATH_FONT_FAMILY = 'katex'

export const BLOCK_MATH_ALIGNMENTS = ['left', 'center', 'right'] as const
export const BLOCK_MATH_FONT_FAMILIES = [
  { value: 'katex', label: 'KaTeX' },
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans serif' },
  { value: 'mono', label: 'Monospace' }
] as const

export type BlockMathAlign = typeof BLOCK_MATH_ALIGNMENTS[number]
export type BlockMathFontFamily = typeof BLOCK_MATH_FONT_FAMILIES[number]['value']

export interface BlockMathAttrs {
  latex: string
  theme: string
  align: BlockMathAlign
  paddingX: number
  paddingY: number
  fontSize: number
  fontFamily: BlockMathFontFamily
}

export function normalizeBlockMathAlign(value: unknown): BlockMathAlign {
  return BLOCK_MATH_ALIGNMENTS.includes(value as BlockMathAlign) ? value as BlockMathAlign : DEFAULT_BLOCK_MATH_ALIGN
}

export function normalizeBlockMathFontFamily(value: unknown): BlockMathFontFamily {
  return BLOCK_MATH_FONT_FAMILIES.some((family) => family.value === value) ? value as BlockMathFontFamily : DEFAULT_BLOCK_MATH_FONT_FAMILY
}

export function normalizeBlockMathPadding(value: unknown, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(96, Math.round(numeric))) : fallback
}

export function normalizeBlockMathFontSize(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0.75, Math.min(2.5, Math.round(numeric * 100) / 100)) : DEFAULT_BLOCK_MATH_FONT_SIZE
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockMath: {
      insertBlockMath: (attrs?: Partial<BlockMathAttrs>) => ReturnType
    }
  }
}

export const BlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element instanceof HTMLElement ? element.getAttribute('data-latex') ?? element.textContent ?? '' : '',
        renderHTML: (attributes) => ({
          'data-latex': String(attributes.latex ?? '')
        })
      },
      theme: {
        default: DEFAULT_BLOCK_MATH_THEME,
        parseHTML: (element) => element.getAttribute('data-theme') ?? DEFAULT_BLOCK_MATH_THEME,
        renderHTML: (attributes) => ({ 'data-theme': String(attributes.theme ?? DEFAULT_BLOCK_MATH_THEME) })
      },
      align: {
        default: DEFAULT_BLOCK_MATH_ALIGN,
        parseHTML: (element) => normalizeBlockMathAlign(element.getAttribute('data-align')),
        renderHTML: (attributes) => ({ 'data-align': normalizeBlockMathAlign(attributes.align) })
      },
      paddingX: {
        default: DEFAULT_BLOCK_MATH_PADDING_X,
        parseHTML: (element) => normalizeBlockMathPadding(element.getAttribute('data-padding-x'), DEFAULT_BLOCK_MATH_PADDING_X),
        renderHTML: (attributes) => ({ 'data-padding-x': String(normalizeBlockMathPadding(attributes.paddingX, DEFAULT_BLOCK_MATH_PADDING_X)) })
      },
      paddingY: {
        default: DEFAULT_BLOCK_MATH_PADDING_Y,
        parseHTML: (element) => normalizeBlockMathPadding(element.getAttribute('data-padding-y'), DEFAULT_BLOCK_MATH_PADDING_Y),
        renderHTML: (attributes) => ({ 'data-padding-y': String(normalizeBlockMathPadding(attributes.paddingY, DEFAULT_BLOCK_MATH_PADDING_Y)) })
      },
      fontSize: {
        default: DEFAULT_BLOCK_MATH_FONT_SIZE,
        parseHTML: (element) => normalizeBlockMathFontSize(element.getAttribute('data-font-size')),
        renderHTML: (attributes) => ({ 'data-font-size': String(normalizeBlockMathFontSize(attributes.fontSize)) })
      },
      fontFamily: {
        default: DEFAULT_BLOCK_MATH_FONT_FAMILY,
        parseHTML: (element) => normalizeBlockMathFontFamily(element.getAttribute('data-font-family')),
        renderHTML: (attributes) => ({ 'data-font-family': normalizeBlockMathFontFamily(attributes.fontFamily) })
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="block-math"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'block-math', 'data-type': 'block-math' })]
  },

  addCommands() {
    return {
      insertBlockMath: (attrs = {}) => ({ commands }) => commands.insertContent({
        type: this.name,
        attrs: {
          latex: attrs.latex ?? '',
          theme: attrs.theme ?? DEFAULT_BLOCK_MATH_THEME,
          align: normalizeBlockMathAlign(attrs.align),
          paddingX: normalizeBlockMathPadding(attrs.paddingX, DEFAULT_BLOCK_MATH_PADDING_X),
          paddingY: normalizeBlockMathPadding(attrs.paddingY, DEFAULT_BLOCK_MATH_PADDING_Y),
          fontSize: normalizeBlockMathFontSize(attrs.fontSize),
          fontFamily: normalizeBlockMathFontFamily(attrs.fontFamily)
        }
      })
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$\s$/,
        handler: ({ state, range }) => {
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex: '' }))
        }
      })
    ]
  }
})