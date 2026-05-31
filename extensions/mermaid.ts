import { mergeAttributes, Node } from '@tiptap/core'
import { DEFAULT_MERMAID_CODE } from '~/utils/blockDefaults'

export const MermaidNode = Node.create({
  name: 'mermaid',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      code: {
        default: DEFAULT_MERMAID_CODE
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