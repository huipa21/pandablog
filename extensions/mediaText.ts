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
      mediaTitlePosition: {
        default: 'bottom',
        parseHTML: (el) => el.getAttribute('data-media-title-position') ?? 'bottom',
        renderHTML: (attrs) => ({ 'data-media-title-position': attrs.mediaTitlePosition ?? 'bottom' })
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

