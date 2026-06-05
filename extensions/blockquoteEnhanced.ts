import { mergeAttributes, Node } from '@tiptap/core'

export const DEFAULT_QUOTE_THEME = '#3e6ae1'
export const DEFAULT_QUOTE_FONT_COLOR = '#171a20'

export const QUOTE_THEME_COLORS = {
  amber: '#f59e0b',
  teal: '#0f766e',
  blue: '#1d4ed8',
  rose: '#be123c',
  violet: '#7c3aed',
  slate: '#475569'
} as const

export const QUOTE_THEMES = [
  { value: 'amber', label: 'Amber', color: QUOTE_THEME_COLORS.amber },
  { value: 'teal', label: 'Teal', color: QUOTE_THEME_COLORS.teal },
  { value: 'blue', label: 'Blue', color: QUOTE_THEME_COLORS.blue },
  { value: 'rose', label: 'Rose', color: QUOTE_THEME_COLORS.rose },
  { value: 'violet', label: 'Violet', color: QUOTE_THEME_COLORS.violet },
  { value: 'slate', label: 'Slate', color: QUOTE_THEME_COLORS.slate }
] as const

export const QUOTE_STYLES = [
  { value: 'bar', label: 'Vertical bar' },
  { value: 'marks', label: 'Quotation marks' }
] as const

export const QUOTE_FONT_FAMILIES = [
  { value: 'sans', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' }
] as const

export type QuoteTheme = (typeof QUOTE_THEMES)[number]['value']
export type QuoteStyle = (typeof QUOTE_STYLES)[number]['value']
export type QuoteFontFamily = (typeof QUOTE_FONT_FAMILIES)[number]['value']

export function resolveQuoteTheme(value: unknown) {
  const theme = String(value ?? DEFAULT_QUOTE_THEME)
  return theme in QUOTE_THEME_COLORS ? QUOTE_THEME_COLORS[theme as keyof typeof QUOTE_THEME_COLORS] : theme
}

export const BlockquoteEnhanced = Node.create({
  name: 'blockquote',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      style: {
        default: 'bar',
        parseHTML: (el) => el.getAttribute('data-style') ?? 'bar',
        renderHTML: (attrs) => ({ 'data-style': attrs.style ?? 'bar' })
      },
      theme: {
        default: DEFAULT_QUOTE_THEME,
        parseHTML: (el) => el.getAttribute('data-theme') ?? DEFAULT_QUOTE_THEME,
        renderHTML: (attrs) => ({ 'data-theme': attrs.theme ?? DEFAULT_QUOTE_THEME })
      },
      fontFamily: {
        default: 'sans',
        parseHTML: (el) => el.getAttribute('data-font-family') ?? 'sans',
        renderHTML: (attrs) => ({ 'data-font-family': attrs.fontFamily ?? 'sans' })
      },
      fontSize: {
        default: '1rem',
        parseHTML: (el) => el.getAttribute('data-font-size') ?? '1rem',
        renderHTML: (attrs) => ({ 'data-font-size': attrs.fontSize ?? '1rem' })
      },
      fontColor: {
        default: DEFAULT_QUOTE_FONT_COLOR,
        parseHTML: (el) => el.getAttribute('data-font-color') ?? DEFAULT_QUOTE_FONT_COLOR,
        renderHTML: (attrs) => ({ 'data-font-color': attrs.fontColor ?? DEFAULT_QUOTE_FONT_COLOR })
      },
      backgroundColor: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-bg-color') ?? '',
        renderHTML: (attrs) => attrs.backgroundColor ? { 'data-bg-color': attrs.backgroundColor } : {}
      },
      authorName: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-author-name') ?? '',
        renderHTML: (attrs) => attrs.authorName ? { 'data-author-name': attrs.authorName } : {}
      },
      authorTitle: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-author-title') ?? '',
        renderHTML: (attrs) => attrs.authorTitle ? { 'data-author-title': attrs.authorTitle } : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'blockquote' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setBlockquote:
        () =>
        ({ commands }) => {
          return commands.wrapIn(this.name)
        },
      toggleBlockquote:
        () =>
        ({ commands }) => {
          return commands.toggleWrap(this.name)
        },
      unsetBlockquote:
        () =>
        ({ commands }) => {
          return commands.lift(this.name)
        }
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-b': () => this.editor.commands.toggleBlockquote()
    }
  }
})
