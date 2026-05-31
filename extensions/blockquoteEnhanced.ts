import { mergeAttributes, Node } from '@tiptap/core'

export const QUOTE_THEMES = [
  { value: 'amber', label: 'Amber', color: '#f59e0b' },
  { value: 'teal', label: 'Teal', color: '#0f766e' },
  { value: 'blue', label: 'Blue', color: '#1d4ed8' },
  { value: 'rose', label: 'Rose', color: '#be123c' },
  { value: 'violet', label: 'Violet', color: '#7c3aed' },
  { value: 'slate', label: 'Slate', color: '#475569' },
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
        default: '#0f766e',
        parseHTML: (el) => el.getAttribute('data-theme') ?? '#0f766e',
        renderHTML: (attrs) => ({ 'data-theme': attrs.theme ?? '#0f766e' })
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
        default: '#1c1917',
        parseHTML: (el) => el.getAttribute('data-font-color') ?? '#1c1917',
        renderHTML: (attrs) => ({ 'data-font-color': attrs.fontColor ?? '#1c1917' })
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
