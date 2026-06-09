import { Node, mergeAttributes } from '@tiptap/core'
import { NodeSelection, Plugin } from '@tiptap/pm/state'

const PANE_STYLES = new Set(['minimal', 'dark', 'colored', 'underline', 'highlighted'])
const TRIGGER_ICONS = new Set(['chevron', 'plus-minus', 'arrow'])
const BLOCK_WIDTHS = new Set(['content', 'wide', 'full-bleed'])

export const AccordionBlockNode = Node.create({
  name: 'accordionBlock',
  group: 'block',
  content: 'accordionPane{1,12}',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      singleOpen: {
        default: true,
        parseHTML: (el) => parseBoolean(el.getAttribute('data-single-open'), true),
        renderHTML: (attrs) => ({ 'data-single-open': attrs.singleOpen === false ? 'false' : 'true' })
      },
      startCollapsed: {
        default: false,
        parseHTML: (el) => parseBoolean(el.getAttribute('data-start-collapsed'), false),
        renderHTML: (attrs) => ({ 'data-start-collapsed': attrs.startCollapsed === true ? 'true' : 'false' })
      },
      columns: {
        default: 1,
        parseHTML: (el) => normalizeColumns(el.getAttribute('data-columns')),
        renderHTML: (attrs) => ({ 'data-columns': String(normalizeColumns(attrs.columns)) })
      },
      paneStyle: {
        default: 'minimal',
        parseHTML: (el) => normalizePaneStyle(el.getAttribute('data-pane-style')),
        renderHTML: (attrs) => ({ 'data-pane-style': normalizePaneStyle(attrs.paneStyle) })
      },
      triggerIcon: {
        default: 'chevron',
        parseHTML: (el) => normalizeTriggerIcon(el.getAttribute('data-trigger-icon')),
        renderHTML: (attrs) => ({ 'data-trigger-icon': normalizeTriggerIcon(attrs.triggerIcon) })
      },
      defaultOpenIndices: {
        default: [0],
        parseHTML: (el) => parseDefaultOpenIndices(el.getAttribute('data-default-open-indices')),
        renderHTML: (attrs) => ({ 'data-default-open-indices': serializeDefaultOpenIndices(attrs.defaultOpenIndices) })
      },
      blockWidth: {
        default: 'content',
        parseHTML: (el) => normalizeBlockWidth(el.getAttribute('data-block-width')),
        renderHTML: (attrs) => ({ 'data-block-width': normalizeBlockWidth(attrs.blockWidth) })
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
    return [{ tag: 'div[data-type="accordion-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'accordion-block', class: 'accordion-block' }), 0]
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const selection = editor.state.selection
        return selection instanceof NodeSelection && selection.node.type.name === 'accordionBlock'
      },
      Delete: ({ editor }) => {
        const selection = editor.state.selection
        return selection instanceof NodeSelection && selection.node.type.name === 'accordionBlock'
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

          const updates: number[] = []
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'accordionBlock') return true

            if (needsAccordionRepair(node)) {
              updates.push(pos)
            }

            return false
          })

          if (!updates.length) {
            return null
          }

          const tr = newState.tr
          for (let index = updates.length - 1; index >= 0; index -= 1) {
            const mappedPos = tr.mapping.map(updates[index]!)
            const current = tr.doc.nodeAt(mappedPos)
            if (!current || current.type.name !== 'accordionBlock') {
              continue
            }

            const singleOpen = parseBoolean(current.attrs.singleOpen, true)
            const startCollapsed = parseBoolean(current.attrs.startCollapsed, false)
            const columns = normalizeColumns(current.attrs.columns)
            const paneStyle = normalizePaneStyle(current.attrs.paneStyle)
            const triggerIcon = normalizeTriggerIcon(current.attrs.triggerIcon)
            const blockWidth = normalizeBlockWidth(current.attrs.blockWidth)
            const panes = current.content.content.filter((child) => child.type.name === 'accordionPane')
            const paneCount = Math.max(1, Math.min(12, panes.length || current.childCount || 1))
            const defaultOpenIndices = normalizeDefaultOpenIndices(
              current.attrs.defaultOpenIndices,
              paneCount,
              singleOpen,
              startCollapsed,
              panes.map((pane) => pane.attrs.defaultOpen === true)
            )
            const normalizedPanes = normalizeAccordionPanes(current, paneCount, defaultOpenIndices, newState.schema.nodes.paragraph)
            const attrs = {
              ...current.attrs,
              singleOpen,
              startCollapsed,
              columns,
              paneStyle,
              triggerIcon,
              blockWidth,
              defaultOpenIndices
            }

            tr.replaceWith(mappedPos, mappedPos + current.nodeSize, current.type.create(attrs, normalizedPanes))
          }

          return tr.docChanged ? tr : null
        }
      })
    ]
  }
})

export const AccordionPaneNode = Node.create({
  name: 'accordionPane',
  content: 'block+',
  defining: true,
  isolating: true,
  selectable: false,

  addAttributes() {
    return {
      title: {
        default: 'Accordion Pane',
        parseHTML: (el) => el.getAttribute('data-title') ?? 'Accordion Pane',
        renderHTML: (attrs) => ({ 'data-title': String(attrs.title ?? 'Accordion Pane') })
      },
      defaultOpen: {
        default: false,
        parseHTML: (el) => parseBoolean(el.getAttribute('data-default-open'), false),
        renderHTML: (attrs) => ({ 'data-default-open': attrs.defaultOpen === true ? 'true' : 'false' })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="accordion-pane"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'accordion-pane', class: 'accordion-pane' }), 0]
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const selection = editor.state.selection
        return selection instanceof NodeSelection && selection.node.type.name === 'accordionPane'
      },
      Delete: ({ editor }) => {
        const selection = editor.state.selection
        return selection instanceof NodeSelection && selection.node.type.name === 'accordionPane'
      }
    }
  }
})

function needsAccordionRepair(node: any) {
  const panes = node.content.content.filter((child: any) => child.type.name === 'accordionPane')
  const paneCount = Math.max(1, Math.min(12, panes.length || node.childCount || 1))
  const singleOpen = parseBoolean(node.attrs.singleOpen, true)
  const startCollapsed = parseBoolean(node.attrs.startCollapsed, false)
  const defaultOpenIndices = normalizeDefaultOpenIndices(
    node.attrs.defaultOpenIndices,
    paneCount,
    singleOpen,
    startCollapsed,
    panes.map((pane: any) => pane.attrs.defaultOpen === true)
  )

  return panes.length !== node.childCount
    || panes.length < 1
    || panes.length > 12
    || parseBoolean(node.attrs.singleOpen, true) !== singleOpen
    || parseBoolean(node.attrs.startCollapsed, false) !== startCollapsed
    || normalizeColumns(node.attrs.columns) !== Number(node.attrs.columns ?? 1)
    || normalizePaneStyle(node.attrs.paneStyle) !== String(node.attrs.paneStyle ?? 'minimal')
    || normalizeTriggerIcon(node.attrs.triggerIcon) !== String(node.attrs.triggerIcon ?? 'chevron')
    || normalizeBlockWidth(node.attrs.blockWidth) !== String(node.attrs.blockWidth ?? 'content')
    || serializeDefaultOpenIndices(node.attrs.defaultOpenIndices) !== serializeDefaultOpenIndices(defaultOpenIndices)
    || panes.some((pane: any, index: number) => pane.attrs.defaultOpen !== defaultOpenIndices.includes(index) || pane.childCount === 0)
}

function normalizeAccordionPanes(accordionNode: any, count: number, defaultOpenIndices: number[], paragraphNodeType: any) {
  const existing = accordionNode.content.content.filter((child: any) => child.type.name === 'accordionPane').slice(0, count)
  const paneType = accordionNode.type.schema.nodes.accordionPane
  const panes = existing.map((pane: any, index: number) => pane.type.create(
    {
      ...(pane.attrs ?? {}),
      title: String(pane.attrs?.title ?? `Accordion Pane ${index + 1}`).trim() || `Accordion Pane ${index + 1}`,
      defaultOpen: defaultOpenIndices.includes(index)
    },
    pane.childCount > 0 ? pane.content : paragraphNodeType.create()
  ))

  while (panes.length < count) {
    const index = panes.length
    panes.push(paneType.create(
      { title: `Accordion Pane ${index + 1}`, defaultOpen: defaultOpenIndices.includes(index) },
      paragraphNodeType.create()
    ))
  }

  return panes
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return fallback
  const normalized = value.toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return fallback
}

function normalizeColumns(value: unknown) {
  const columns = Number(value)
  return Math.max(1, Math.min(3, Number.isFinite(columns) ? Math.round(columns) : 1))
}

function normalizePaneStyle(value: unknown) {
  const normalized = String(value ?? 'minimal')
  return PANE_STYLES.has(normalized) ? normalized : 'minimal'
}

function normalizeTriggerIcon(value: unknown) {
  const normalized = String(value ?? 'chevron')
  return TRIGGER_ICONS.has(normalized) ? normalized : 'chevron'
}

function normalizeBlockWidth(value: unknown) {
  const normalized = String(value ?? 'content')
  return BLOCK_WIDTHS.has(normalized) ? normalized : 'content'
}

function parseDefaultOpenIndices(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0)
  }

  return String(value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((item) => Number.isInteger(item) && item >= 0)
}

function normalizeDefaultOpenIndices(value: unknown, count: number, singleOpen: boolean, startCollapsed: boolean, childDefaults: boolean[] = []) {
  if (startCollapsed) {
    return []
  }

  const parsed = parseDefaultOpenIndices(value)
  const source = parsed.length ? parsed : childDefaults.map((open, index) => open ? index : -1).filter((index) => index >= 0)
  const unique = Array.from(new Set(source))
    .filter((index) => index >= 0 && index < count)
    .sort((left, right) => left - right)

  return singleOpen ? unique.slice(0, 1) : unique
}

function serializeDefaultOpenIndices(value: unknown) {
  return parseDefaultOpenIndices(value).join(',')
}