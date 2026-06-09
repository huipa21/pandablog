import { mergeAttributes, Node } from '@tiptap/core'

export const MediaTextNode = Node.create({
  name: 'mediaText',
  group: 'block',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      mediaSrc: { default: '' },
      mediaAlt: { default: '' },
      mediaTitle: { default: '' },
      mediaItems: {
        default: [],
        parseHTML: (el) => parseMediaItems(el.getAttribute('data-media-items')),
        renderHTML: (attrs) => {
          const items = Array.isArray(attrs.mediaItems) ? attrs.mediaItems : []
          return items.length ? { 'data-media-items': JSON.stringify(items) } : {}
        }
      },
      mediaTitlePosition: {
        default: 'bottom',
        parseHTML: (el) => el.getAttribute('data-media-title-position') ?? 'bottom',
        renderHTML: (attrs) => ({ 'data-media-title-position': attrs.mediaTitlePosition ?? 'bottom' })
      },
      mediaSourceSize: {
        default: 'full',
        parseHTML: (el) => {
          const value = el.getAttribute('data-media-source-size')
          return value === 'thumbnail' || value === 'medium' || value === 'large' || value === 'full'
            ? value
            : 'full'
        },
        renderHTML: (attrs) => ({ 'data-media-source-size': attrs.mediaSourceSize ?? 'full' })
      },
      mediaDisplaySize: {
        default: 'fill-container',
        parseHTML: (el) => {
          const value = el.getAttribute('data-media-display-size')
          return value === 'natural'
            || value === 'fill-container'
            || value === 'custom-percent'
            || value === 'custom-px'
            || value === 'viewport'
            || value === 'full-bleed'
            ? value
            : 'fill-container'
        },
        renderHTML: (attrs) => ({ 'data-media-display-size': attrs.mediaDisplaySize ?? 'fill-container' })
      },
      mediaDisplayPercent: {
        default: 100,
        parseHTML: (el) => {
          const n = parseFloat(el.getAttribute('data-media-display-percent') ?? '')
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.mediaDisplayPercent ? { 'data-media-display-percent': String(attrs.mediaDisplayPercent) } : {})
      },
      mediaDisplayPx: {
        default: null,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-media-display-px') ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.mediaDisplayPx ? { 'data-media-display-px': String(attrs.mediaDisplayPx) } : {})
      },
      blockWidth: {
        default: 'content',
        parseHTML: (el) => {
          const value = el.getAttribute('data-block-width')
          return value === 'content' || value === 'wide' || value === 'full-bleed' ? value : 'content'
        },
        renderHTML: (attrs) => ({ 'data-block-width': attrs.blockWidth ?? 'content' })
      },
      mediaWidth: {
        default: null,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-media-width') ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.mediaWidth ? { 'data-media-width': String(attrs.mediaWidth) } : {})
      },
      mediaHeight: {
        default: null,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-media-height') ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.mediaHeight ? { 'data-media-height': String(attrs.mediaHeight) } : {})
      },
      mediaWidthPercent: {
        default: 100,
        parseHTML: (el) => {
          const n = parseFloat(el.getAttribute('data-media-width-percent') ?? '')
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.mediaWidthPercent ? { 'data-media-width-percent': String(attrs.mediaWidthPercent) } : {})
      },
      mediaNaturalWidth: {
        default: null,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-media-natural-width') ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.mediaNaturalWidth ? { 'data-media-natural-width': String(attrs.mediaNaturalWidth) } : {})
      },
      mediaNaturalHeight: {
        default: null,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-media-natural-height') ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.mediaNaturalHeight ? { 'data-media-natural-height': String(attrs.mediaNaturalHeight) } : {})
      },
      lockAspect: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-lock-aspect') !== 'false',
        renderHTML: (attrs) => ({ 'data-lock-aspect': attrs.lockAspect === false ? 'false' : 'true' })
      },
      mediaPosition: {
        default: 'left',
        parseHTML: (el) => el.getAttribute('data-media-position') ?? 'left',
        renderHTML: (attrs) => ({ 'data-media-position': attrs.mediaPosition ?? 'left' })
      },
      ratio: {
        default: 0.5,
        parseHTML: (el) => {
          const v = parseFloat(el.getAttribute('data-ratio') ?? '')
          return Number.isFinite(v) ? v : 0.5
        },
        renderHTML: (attrs) => ({ 'data-ratio': String(attrs.ratio ?? 0.5) })
      },
      mediaMime: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-media-mime') ?? '',
        renderHTML: (attrs) => (attrs.mediaMime ? { 'data-media-mime': String(attrs.mediaMime) } : {})
      },
      mediaName: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-media-name') ?? '',
        renderHTML: (attrs) => (attrs.mediaName ? { 'data-media-name': String(attrs.mediaName) } : {})
      },
      mediaSize: {
        default: null,
        parseHTML: (el) => {
          const n = parseInt(el.getAttribute('data-media-size') ?? '', 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attrs) => (attrs.mediaSize ? { 'data-media-size': String(attrs.mediaSize) } : {})
      }
    }
  },

  content: 'block+',

  parseHTML() {
    return [{ tag: 'div[data-type="media-text"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'media-text' }), 0]
  }
})

function parseMediaItems(value: string | null) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

