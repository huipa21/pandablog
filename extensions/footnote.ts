import { Mark, mergeAttributes } from '@tiptap/core'

export interface FootnoteOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      setFootnote: (attrs: { id?: string, index: number }) => ReturnType
      unsetFootnote: () => ReturnType
    }
  }
}

let footnoteCounter = 0

function generateFootnoteId() {
  footnoteCounter += 1
  return `fn-${Date.now().toString(36)}-${footnoteCounter}`
}

export const Footnote = Mark.create<FootnoteOptions>({
  name: 'footnote',
  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {}
    }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-footnote-id'),
        renderHTML: (attributes) => ({
          'data-footnote-id': attributes.id
        })
      },
      index: {
        default: 1,
        parseHTML: (element) => Number(element.getAttribute('data-footnote-index') ?? 1),
        renderHTML: (attributes) => ({
          'data-footnote-index': String(attributes.index ?? 1)
        })
      }
    }
  },

  parseHTML() {
    return [
      { tag: 'sup[data-footnote-id]' }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const id = String(HTMLAttributes.id ?? generateFootnoteId())
    const index = Number(HTMLAttributes.index ?? 1)

    return [
      'sup',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { id: `fnref-${id}`, class: 'footnote-ref' }),
      ['a', { href: `#fn-${id}` }, String(index)]
    ]
  },

  addCommands() {
    return {
      setFootnote: (attrs) => ({ commands }) => {
        return commands.setMark(this.name, {
          id: attrs.id || generateFootnoteId(),
          index: attrs.index
        })
      },
      unsetFootnote: () => ({ commands }) => {
        return commands.unsetMark(this.name)
      }
    }
  }
})

export { generateFootnoteId }
