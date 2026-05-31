import { Node, mergeAttributes } from '@tiptap/core'

export const FootnotesBlockNode = Node.create({
  name: 'footnotesBlock',
  group: 'block',
  content: 'orderedList',
  defining: true,
  isolating: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'section[data-footnotes-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-footnotes-block': 'true',
        class: 'footnotes-block'
      }),
      0
    ]
  }
})
