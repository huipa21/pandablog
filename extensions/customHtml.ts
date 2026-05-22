import { mergeAttributes, Node } from '@tiptap/core'

export interface CustomHtmlAttrs {
  html: string
}

export const CustomHtmlNode = Node.create({
  name: 'customHtml',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      html: {
        default: '<div class="embed-card">Custom HTML</div>',
        parseHTML: (element) => (element instanceof HTMLElement ? element.innerHTML : '')
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="custom-html"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { html, ...rest } = HTMLAttributes as Record<string, unknown> & { html?: string }
    return [
      'div',
      mergeAttributes(rest, { 'data-type': 'custom-html', 'data-html': String(html ?? '') }),
      0
    ]
  }
})
