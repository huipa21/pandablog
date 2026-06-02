import { mergeAttributes, Node } from '@tiptap/core'

export const MermaidNode = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      code: {
        default: ''
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'pre[data-type="mermaid"]',
        getAttrs: (element) => ({
          code: element instanceof HTMLElement ? element.textContent ?? '' : ''
        })
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { code, ...attrs } = HTMLAttributes
    return [
      'pre',
      mergeAttributes(attrs, { 'data-type': 'mermaid' }),
      ['code', String(code ?? '')]
    ]
  }
})