import { mergeAttributes, Node } from '@tiptap/core'

export const PreformattedNode = Node.create({
  name: 'preformatted',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  addAttributes() {
    return {
      textColor: {
        default: '#e7e5e4',
        parseHTML: (element) => element.getAttribute('data-text-color') ?? '#e7e5e4',
        renderHTML: (attrs) => ({ 'data-text-color': attrs.textColor ?? '#e7e5e4' })
      },
      backgroundColor: {
        default: '#1c1917',
        parseHTML: (element) => element.getAttribute('data-bg-color') ?? '#1c1917',
        renderHTML: (attrs) => ({ 'data-bg-color': attrs.backgroundColor ?? '#1c1917' })
      },
      fontSize: {
        default: 14,
        parseHTML: (element) => Number(element.getAttribute('data-font-size') ?? 14),
        renderHTML: (attrs) => ({ 'data-font-size': String(attrs.fontSize ?? 14) })
      },
      lineNumbers: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-line-numbers') !== 'false',
        renderHTML: (attrs) => ({ 'data-line-numbers': attrs.lineNumbers === false ? 'false' : 'true' })
      },
      marginY: {
        default: 12,
        parseHTML: (element) => Number(element.getAttribute('data-margin-y') ?? 12),
        renderHTML: (attrs) => ({ 'data-margin-y': String(attrs.marginY ?? 12) })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'pre[data-type="preformatted"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const textColor = String(HTMLAttributes.textColor ?? '#e7e5e4')
    const backgroundColor = String(HTMLAttributes.backgroundColor ?? '#1c1917')
    const fontSize = Math.max(10, Number(HTMLAttributes.fontSize ?? 14))
    const marginY = Math.max(0, Number(HTMLAttributes.marginY ?? 12))

    const style = `color: ${textColor}; background: ${backgroundColor}; font-size: ${fontSize}px; margin: ${marginY}px 0;`

    return [
      'pre',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'preformatted',
        class: 'preformatted-block',
        style
      }),
      ['code', 0]
    ]
  }
})
