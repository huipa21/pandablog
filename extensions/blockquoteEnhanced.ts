import { mergeAttributes, Node } from '@tiptap/core'

export const QUOTE_STYLES = [
  { value: 'bar', label: 'Vertical bar' },
  { value: 'marks', label: 'Quotation marks' }
] as const

export type QuoteStyle = (typeof QUOTE_STYLES)[number]['value']

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
