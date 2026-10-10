import { InputRule, mergeAttributes, Node } from '@tiptap/core'

export const DEFAULT_BLOCK_MATH_ALIGN = 'center'
export const DEFAULT_BLOCK_MATH_PADDING_X = 16
export const DEFAULT_BLOCK_MATH_PADDING_Y = 16
export const DEFAULT_BLOCK_MATH_FONT_SIZE = 1.15
export const DEFAULT_BLOCK_MATH_FONT_FAMILY = 'katex'
export const BLOCK_MATH_ALIGNMENTS = ['left', 'center', 'right'] as const
export type BlockMathAlign = typeof BLOCK_MATH_ALIGNMENTS[number]
export interface BlockMathAttrs { latex: string, align: BlockMathAlign }
export function normalizeBlockMathAlign(value: unknown): BlockMathAlign {
  return BLOCK_MATH_ALIGNMENTS.includes(value as BlockMathAlign) ? value as BlockMathAlign : DEFAULT_BLOCK_MATH_ALIGN
}
declare module '@tiptap/core' {
  interface Commands<ReturnType> { blockMath: { insertBlockMath: (attrs?: Partial<BlockMathAttrs>) => ReturnType } }
}
export const BlockMath = Node.create({
  name: 'blockMath', group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes() {
    return {
      latex: { default: '', parseHTML: el => el.getAttribute('data-latex') ?? el.textContent ?? '', renderHTML: attrs => ({ 'data-latex': String(attrs.latex ?? '') }) },
      align: { default: 'center', parseHTML: el => normalizeBlockMathAlign(el.getAttribute('data-align')), renderHTML: attrs => ({ 'data-align': normalizeBlockMathAlign(attrs.align) }) }
    }
  },
  parseHTML() { return [{ tag: 'div[data-type="block-math"]' }] },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { class: 'block-math', 'data-type': 'block-math' })] },
  addCommands() { return { insertBlockMath: (attrs = {}) => ({ commands }) => commands.insertContent({ type: this.name, attrs: { latex: attrs.latex ?? '', align: normalizeBlockMathAlign(attrs.align) } }) } },
  addInputRules() { return [new InputRule({ find: /^\$\$\s$/, handler: ({ state, range }) => { state.tr.replaceWith(range.from, range.to, this.type.create({ latex: '' })) } })] }
})
