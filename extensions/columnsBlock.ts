import { Node, mergeAttributes } from '@tiptap/core'
import { NodeSelection, Plugin } from '@tiptap/pm/state'

const COLUMN_PROPORTIONS = new Set(['1-1', '1-2', '2-1', '1-1-1', '1-1-2', '1-2-1', '2-1-1', '1-1-1-1', '1-1-1-1-1', '1-1-1-1-1-1'])
const BLOCK_WIDTHS = new Set(['content', 'wide', 'full-bleed'])

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
      showHeaders: {
        default: true,
        parseHTML: (el) => {
          const value = (el.getAttribute('data-show-headers') ?? 'true').toLowerCase()
          return value !== 'false'
        },
        renderHTML: (attrs) => ({ 'data-show-headers': attrs.showHeaders === false ? 'false' : 'true' })
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
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null
          }

          const updates: Array<{ pos: number, expectedColumns: number }> = []
          newState.doc.forEach((node, pos) => {
            if (node.type.name !== 'columnsBlock') return

            const expectedColumns = normalizeColumnsCount(node.attrs.columns, node.childCount || 2)
            const customPercentages = normalizeCustomPercentages(String(node.attrs.customPercentages ?? ''), expectedColumns)
            const needsColumnRepair = node.childCount !== expectedColumns
              || node.content.content.some((child) => child.type.name !== 'columnItem')
            const needsAttrRepair = Number(node.attrs.columns) !== expectedColumns
              || String(node.attrs.customPercentages ?? '') !== customPercentages

            if (needsColumnRepair || needsAttrRepair) {
              updates.push({ pos, expectedColumns })
            }
          })

          if (!updates.length) {
            return null
          }

          const tr = newState.tr
          for (let i = updates.length - 1; i >= 0; i -= 1) {
            const update = updates[i]
            if (!update) continue

            const mappedPos = tr.mapping.map(update.pos)
            const current = tr.doc.nodeAt(mappedPos)
            if (!current || current.type.name !== 'columnsBlock') {
              continue
            }

            const expectedColumns = normalizeColumnsCount(current.attrs.columns, update.expectedColumns)
            const normalizedColumns = normalizeColumnItems(current, expectedColumns, newState.schema.nodes.paragraph)
            const attrs = {
              ...current.attrs,
              columns: expectedColumns,
              customPercentages: normalizeCustomPercentages(String(current.attrs.customPercentages ?? ''), expectedColumns)
            }

            const replacement = current.type.create(attrs, normalizedColumns)
            tr.replaceWith(mappedPos, mappedPos + current.nodeSize, replacement)
          }

          return tr.docChanged ? tr : null
        }
      })
    ]
  }
})

export const ColumnItemNode = Node.create({
  name: 'columnItem',
  content: 'block+',
  defining: true,
  isolating: true,
  selectable: false,

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

function normalizeColumnsCount(rawCount: unknown, fallback: number) {
  const count = Number(rawCount)
  const base = Number.isFinite(count) && count > 0 ? count : fallback
  return Math.max(2, Math.min(6, Math.round(base || 2)))
}

function normalizeCustomPercentages(value: string, count: number) {
  if (!value.trim()) return ''

  const parts = value.split(',').map((part) => Number(part.trim()))
  if (parts.length !== count || parts.some((part) => !Number.isFinite(part) || part <= 0 || part >= 100)) {
    return ''
  }

  const total = parts.reduce((sum, part) => sum + part, 0)
  if (Math.abs(total - 100) > 0.1) {
    return ''
  }

  return parts
    .map((part) => Math.round(part * 100) / 100)
    .map((part) => part.toFixed(2).replace(/\.00$/, ''))
    .join(',')
}

function normalizeColumnItems(columnsBlockNode: any, count: number, paragraphNodeType: any) {
  const existing = columnsBlockNode.content.content.filter((child: any) => child.type.name === 'columnItem')
  const next = existing.slice(0, count).map((child: any) => {
    if (child.childCount > 0) {
      return child.type.create({ ...(child.attrs ?? {}), header: String(child.attrs?.header ?? '') }, child.content)
    }

    return child.type.create(
      { ...(child.attrs ?? {}), header: String(child.attrs?.header ?? '') },
      paragraphNodeType.create()
    )
  })

  const overflow = existing.slice(count)
  if (overflow.length && next.length) {
    const last = next[next.length - 1]
    if (last) {
      const mergedContent = [
        ...last.content.content,
        ...overflow.flatMap((column: any) => column.content.content)
      ]
      next[next.length - 1] = last.type.create(last.attrs, mergedContent)
    }
  }

  while (next.length < count) {
    next.push(
      columnsBlockNode.type.schema.nodes.columnItem.create(
        { header: '' },
        paragraphNodeType.create()
      )
    )
  }

  return next
}