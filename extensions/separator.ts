import { mergeAttributes, Node } from '@tiptap/core'

export const SeparatorNode = Node.create({
  name: 'horizontalRule', group: 'block', atom: true, selectable: true, draggable: true,
  addAttributes() { return {
    styleType: { default: 'solid', parseHTML: el => el.getAttribute('data-separator-style') ?? 'solid', renderHTML: attrs => ({ 'data-separator-style': attrs.styleType ?? 'solid' }) }
  } },
  parseHTML() { return [{ tag: 'div[data-type="separator"]' }, { tag: 'hr' }] },
  renderHTML({ node, HTMLAttributes }) {
    const style = ['solid', 'dashed', 'dotted'].includes(node.attrs.styleType) ? node.attrs.styleType : 'solid'
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'separator', class: 'separator-node' }), ['hr', { style: `width: 100%; border: 0; border-top: 1px ${style} var(--pb-divider); margin: var(--space-lg, 1rem) 0;` }]]
  }
})
