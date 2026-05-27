import { mergeAttributes, Node } from '@tiptap/core'

export const SeparatorNode = Node.create({
  name: 'horizontalRule',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      styleType: {
        default: 'solid',
        parseHTML: (element) => element.getAttribute('data-separator-style') ?? 'solid',
        renderHTML: (attrs) => ({ 'data-separator-style': attrs.styleType ?? 'solid' })
      },
      thickness: {
        default: 1,
        parseHTML: (element) => Number(element.getAttribute('data-separator-thickness') ?? 1),
        renderHTML: (attrs) => ({ 'data-separator-thickness': String(attrs.thickness ?? 1) })
      },
      marginY: {
        default: 16,
        parseHTML: (element) => Number(element.getAttribute('data-separator-margin') ?? 16),
        renderHTML: (attrs) => ({ 'data-separator-margin': String(attrs.marginY ?? 16) })
      },
      color: {
        default: '#d6d3d1',
        parseHTML: (element) => element.getAttribute('data-separator-color') ?? '#d6d3d1',
        renderHTML: (attrs) => ({ 'data-separator-color': attrs.color ?? '#d6d3d1' })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="separator"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const styleType = String(node.attrs.styleType ?? 'solid')
    const thickness = Math.max(1, Number(node.attrs.thickness ?? 1))
    const marginY = Math.max(0, Number(node.attrs.marginY ?? 16))
    const color = String(node.attrs.color ?? '#d6d3d1')

    const hrStyle = `width: 100%; border: 0; border-top: ${thickness}px ${styleType} ${color}; margin: ${marginY}px 0;`

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'separator',
        class: 'separator-node'
      }),
      ['hr', { style: hrStyle }]
    ]
  }
})
