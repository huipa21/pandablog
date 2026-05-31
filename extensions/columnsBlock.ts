import { Node, mergeAttributes } from '@tiptap/core'

const COLUMN_PROPORTIONS = new Set(['1-1', '1-2', '2-1', '1-1-1', '1-1-2', '1-2-1', '2-1-1'])
const BLOCK_WIDTHS = new Set(['content', 'wide', 'full-bleed'])

export const ColumnsBlockNode = Node.create({
  name: 'columnsBlock',
  group: 'block',
  content: 'columnItem{2,3}',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: (el) => {
          const value = Number(el.getAttribute('data-columns'))
          return value === 3 ? 3 : 2
        },
        renderHTML: (attrs) => ({ 'data-columns': String(attrs.columns === 3 ? 3 : 2) })
      },
      proportions: {
        default: '1-1',
        parseHTML: (el) => {
          const value = el.getAttribute('data-proportions') ?? '1-1'
          return COLUMN_PROPORTIONS.has(value) ? value : '1-1'
        },
        renderHTML: (attrs) => ({ 'data-proportions': COLUMN_PROPORTIONS.has(String(attrs.proportions)) ? String(attrs.proportions) : '1-1' })
      },
      blockWidth: {
        default: 'content',
        parseHTML: (el) => {
          const value = el.getAttribute('data-block-width') ?? 'content'
          return BLOCK_WIDTHS.has(value) ? value : 'content'
        },
        renderHTML: (attrs) => ({ 'data-block-width': BLOCK_WIDTHS.has(String(attrs.blockWidth)) ? String(attrs.blockWidth) : 'content' })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columns-block', class: 'columns-block' }), 0]
  }
})

export const ColumnItemNode = Node.create({
  name: 'columnItem',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      header: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-header') ?? '',
        renderHTML: (attrs) => {
          const header = String(attrs.header ?? '').trim()
          return header ? { 'data-header': header } : {}
        }
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column-item"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column-item', class: 'columns-block-column' }), 0]
  }
})