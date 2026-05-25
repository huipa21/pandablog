import { mergeAttributes, Node } from '@tiptap/core'

export interface ImageBlockAttrs {
  src: string
  alt: string
  title: string
  titlePosition: 'none' | 'top' | 'bottom'
  sourceSize: 'thumbnail' | 'medium' | 'large' | 'full'
  displaySize: 'natural' | 'fill-container' | 'custom-percent' | 'custom-px' | 'viewport' | 'full-bleed'
  displayPercent: number | null
  displayPx: number | null
  width: number | null
  height: number | null
  widthPercent: number | null
  naturalWidth: number | null
  naturalHeight: number | null
  lockAspect: boolean
  align: 'left' | 'center' | 'right'
}

export const ImageBlockNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      title: { default: '' },
      titlePosition: {
        default: 'bottom',
        parseHTML: (el) => (el.getAttribute('data-title-position') as ImageBlockAttrs['titlePosition']) ?? 'bottom',
        renderHTML: (attrs) => ({ 'data-title-position': attrs.titlePosition ?? 'bottom' })
      },
      sourceSize: {
        default: 'full',
        parseHTML: (el) => {
          const value = el.getAttribute('data-source-size')
          return value === 'thumbnail' || value === 'medium' || value === 'large' || value === 'full'
            ? value
            : 'full'
        },
        renderHTML: (attrs) => ({ 'data-source-size': attrs.sourceSize ?? 'full' })
      },
      displaySize: {
        default: 'fill-container',
        parseHTML: (el) => {
          const value = el.getAttribute('data-display-size')
          return value === 'natural'
            || value === 'fill-container'
            || value === 'custom-percent'
            || value === 'custom-px'
            || value === 'viewport'
            || value === 'full-bleed'
            ? value
            : 'fill-container'
        },
        renderHTML: (attrs) => ({ 'data-display-size': attrs.displaySize ?? 'fill-container' })
      },
      displayPercent: {
        default: 100,
        parseHTML: (el) => {
          const n = parseFloat(el.getAttribute('data-display-percent') ?? '')
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.displayPercent ? { 'data-display-percent': String(attrs.displayPercent) } : {})
      },
      displayPx: {
        default: null,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-display-px') ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.displayPx ? { 'data-display-px': String(attrs.displayPx) } : {})
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('width') ?? el.style.width
          const n = parseInt(v ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.width ? { width: String(attrs.width) } : {})
      },
      height: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('height') ?? el.style.height
          const n = parseInt(v ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.height ? { height: String(attrs.height) } : {})
      },
      widthPercent: {
        default: 100,
        parseHTML: (el) => {
          const n = parseFloat(el.getAttribute('data-width-percent') ?? '')
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.widthPercent ? { 'data-width-percent': String(attrs.widthPercent) } : {})
      },
      naturalWidth: {
        default: null,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-natural-width') ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.naturalWidth ? { 'data-natural-width': String(attrs.naturalWidth) } : {})
      },
      naturalHeight: {
        default: null,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-natural-height') ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.naturalHeight ? { 'data-natural-height': String(attrs.naturalHeight) } : {})
      },
      lockAspect: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-lock-aspect') !== 'false',
        renderHTML: (attrs) => ({ 'data-lock-aspect': attrs.lockAspect === false ? 'false' : 'true' })
      },
      align: {
        default: 'center',
        parseHTML: (el) => (el.getAttribute('data-align') as ImageBlockAttrs['align']) ?? 'center',
        renderHTML: (attrs) => ({ 'data-align': attrs.align ?? 'center' })
      }
    }
  },

  parseHTML() {
    return [
      { tag: 'img[src]' },
      { tag: 'figure[data-type="image"] img', priority: 60 }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  }
})
