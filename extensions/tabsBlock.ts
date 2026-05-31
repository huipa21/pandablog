import { Node, mergeAttributes } from '@tiptap/core'

const TAB_ORIENTATIONS = new Set(['horizontal', 'vertical'])
const TAB_STYLES = new Set(['underline', 'pills', 'enclosed'])
const BLOCK_WIDTHS = new Set(['content', 'wide', 'full-bleed'])

export const TabsBlockNode = Node.create({
  name: 'tabsBlock',
  group: 'block',
  content: 'tabPanel{2,6}',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      orientation: {
        default: 'horizontal',
        parseHTML: (el) => {
          const value = el.getAttribute('data-orientation') ?? 'horizontal'
          return TAB_ORIENTATIONS.has(value) ? value : 'horizontal'
        },
        renderHTML: (attrs) => ({ 'data-orientation': TAB_ORIENTATIONS.has(String(attrs.orientation)) ? String(attrs.orientation) : 'horizontal' })
      },
      tabStyle: {
        default: 'underline',
        parseHTML: (el) => {
          const value = el.getAttribute('data-tab-style') ?? 'underline'
          return TAB_STYLES.has(value) ? value : 'underline'
        },
        renderHTML: (attrs) => ({ 'data-tab-style': TAB_STYLES.has(String(attrs.tabStyle)) ? String(attrs.tabStyle) : 'underline' })
      },
      blockWidth: {
        default: 'content',
        parseHTML: (el) => {
          const value = el.getAttribute('data-block-width') ?? 'content'
          return BLOCK_WIDTHS.has(value) ? value : 'content'
        },
        renderHTML: (attrs) => ({ 'data-block-width': BLOCK_WIDTHS.has(String(attrs.blockWidth)) ? String(attrs.blockWidth) : 'content' })
      },
      activeIndex: {
        default: 0,
        parseHTML: (el) => {
          const value = Number(el.getAttribute('data-active-index') ?? 0)
          return Number.isFinite(value) ? Math.max(0, value) : 0
        },
        renderHTML: (attrs) => ({ 'data-active-index': String(Math.max(0, Number(attrs.activeIndex ?? 0) || 0)) })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tabs-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'tabs-block', class: 'tabs-block' }), 0]
  }
})

export const TabPanelNode = Node.create({
  name: 'tabPanel',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      title: {
        default: 'Tab',
        parseHTML: (el) => el.getAttribute('data-title') ?? 'Tab',
        renderHTML: (attrs) => ({ 'data-title': String(attrs.title ?? 'Tab') })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tab-panel"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'tab-panel', class: 'tabs-block-panel' }), 0]
  }
})