import { InputRule, mergeAttributes, Node } from '@tiptap/core'

export interface InlineMathAttrs {
  latex: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineMath: {
      setInlineMath: (attrs: InlineMathAttrs) => ReturnType
    }
  }
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element instanceof HTMLElement ? element.getAttribute('data-latex') ?? element.textContent ?? '' : '',
        renderHTML: (attributes) => ({
          'data-latex': String(attributes.latex ?? '')
        })
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="inline-math"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'inline-math', 'data-type': 'inline-math' })]
  },

  addCommands() {
    return {
      setInlineMath: (attrs) => ({ commands }) => commands.insertContent({
        type: this.name,
        attrs: { latex: attrs.latex ?? '' }
      })
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|\s)\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          const fullMatch = match[0]
          const latex = match[1]
          const leadingSpace = fullMatch.startsWith(' ') ? ' ' : ''
          const from = range.from + leadingSpace.length
          const { tr } = state

          tr.replaceWith(from, range.to, this.type.create({ latex }))

          if (leadingSpace) {
            tr.insertText(leadingSpace, range.from)
          }
        }
      })
    ]
  }
})