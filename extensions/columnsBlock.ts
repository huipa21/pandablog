import { Node, mergeAttributes } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'

const COLUMN_PROPORTIONS = new Set(['1-1', '1-2', '2-1', '1-1-1', '1-1-2', '1-2-1', '2-1-1', '1-1-1-1', '1-1-1-1-1', '1-1-1-1-1-1'])
const BLOCK_WIDTHS = new Set(['content', 'wide', 'full-bleed'])
const HEADER_ALIGNMENTS = new Set(['left', 'center', 'right'])

export const ColumnsBlockNode = Node.create({
  name: 'columnsBlock',
  group: 'block',
  content: 'columnItem{2,6}',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: (el) => {
          const value = Number(el.getAttribute('data-columns'))
          return Math.max(2, Math.min(6, value || 2))
        },
        renderHTML: (attrs) => ({ 'data-columns': String(Math.max(2, Math.min(6, attrs.columns || 2))) })
      },
      proportions: {
        default: '1-1',
        parseHTML: (el) => {
          const value = el.getAttribute('data-proportions') ?? '1-1'
          return COLUMN_PROPORTIONS.has(value) ? value : '1-1'
        },
        renderHTML: (attrs) => ({ 'data-proportions': COLUMN_PROPORTIONS.has(String(attrs.proportions)) ? String(attrs.proportions) : '1-1' })
      },
      customPercentages: {
        default: '',
        parseHTML: (el) => {
          const value = el.getAttribute('data-custom-percentages') ?? ''
          return value
        },
        renderHTML: (attrs) => {
          const value = String(attrs.customPercentages ?? '').trim()
          return value ? { 'data-custom-percentages': value } : {}
        }
      },
      blockWidth: {
        default: 'content',
        parseHTML: (el) => {
          const value = el.getAttribute('data-block-width') ?? 'content'
          return BLOCK_WIDTHS.has(value) ? value : 'content'
        },
        renderHTML: (attrs) => ({ 'data-block-width': BLOCK_WIDTHS.has(String(attrs.blockWidth)) ? String(attrs.blockWidth) : 'content' })
      },
      columnGap: {
        default: '1rem',
        parseHTML: (el) => el.getAttribute('data-column-gap') ?? '1rem',
        renderHTML: (attrs) => ({ 'data-column-gap': String(attrs.columnGap ?? '1rem') })
      },
      marginTop: {
        default: '1rem',
        parseHTML: (el) => el.getAttribute('data-margin-top') ?? '1rem',
        renderHTML: (attrs) => ({ 'data-margin-top': String(attrs.marginTop ?? '1rem') })
      },
      marginBottom: {
        default: '1rem',
        parseHTML: (el) => el.getAttribute('data-margin-bottom') ?? '1rem',
        renderHTML: (attrs) => ({ 'data-margin-bottom': String(attrs.marginBottom ?? '1rem') })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columns-block', class: 'columns-block' }), 0]
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const selection = editor.state.selection
        return selection instanceof NodeSelection && selection.node.type.name === 'columnsBlock'
      },
      Delete: ({ editor }) => {
        const selection = editor.state.selection
        return selection instanceof NodeSelection && selection.node.type.name === 'columnsBlock'
      }
    }
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
      },
      widthPercent: {
        default: 0,
        parseHTML: (el) => {
          const value = Number(el.getAttribute('data-width-percent'))
          return value > 0 ? Math.min(100, Math.max(1, value)) : 0
        },
        renderHTML: (attrs) => {
          const value = Number(attrs.widthPercent ?? 0)
          return value > 0 ? { 'data-width-percent': String(value) } : {}
        }
      },
      headerAlignment: {
        default: 'left',
        parseHTML: (el) => {
          const value = el.getAttribute('data-header-alignment') ?? 'left'
          return HEADER_ALIGNMENTS.has(value) ? value : 'left'
        },
        renderHTML: (attrs) => {
          const value = String(attrs.headerAlignment ?? 'left')
          return HEADER_ALIGNMENTS.has(value) ? { 'data-header-alignment': value } : {}
        }
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column-item"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column-item', class: 'columns-block-column' }), 0]
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const selection = editor.state.selection
        return selection instanceof NodeSelection && selection.node.type.name === 'columnItem'
      },
      Delete: ({ editor }) => {
        const selection = editor.state.selection
        return selection instanceof NodeSelection && selection.node.type.name === 'columnItem'
      }
    }
  }
})