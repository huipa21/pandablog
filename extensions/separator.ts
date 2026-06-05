import { mergeAttributes, Node } from '@tiptap/core'

export const DEFAULT_SEPARATOR_COLOR = '#d0d1d2'
export const SEPARATOR_SELECTED_BORDER_COLOR = '#3e6ae1'

export const SEPARATOR_PALETTE = [
  DEFAULT_SEPARATOR_COLOR,
  '#3e6ae1',
  '#171a20',
  '#393c41',
  '#5c5e62',
  '#8e8e8e',
  '#eeeeee',
  '#f4f4f4'
] as const

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
        default: DEFAULT_SEPARATOR_COLOR,
        parseHTML: (element) => element.getAttribute('data-separator-color') ?? DEFAULT_SEPARATOR_COLOR,
        renderHTML: (attrs) => ({ 'data-separator-color': attrs.color ?? DEFAULT_SEPARATOR_COLOR })
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
    const color = String(node.attrs.color ?? DEFAULT_SEPARATOR_COLOR)

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
