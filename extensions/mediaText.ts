import { mergeAttributes, Node } from '@tiptap/core'
import { importedImagePreset, importedLayoutPreset, presentationHtmlAttrs } from '~/utils/blockPresentation'

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
      mediaSizePreset: {
        default: 'full',
        parseHTML: el => importedImagePreset(presentationHtmlAttrs(el), true),
        renderHTML: attrs => ({ 'data-media-size-preset': attrs.mediaSizePreset })
      },
      imageSources: { default: null, rendered: false },
      blockWidth: {
        default: 'content',
        parseHTML: (el) => {
          const value = el.getAttribute('data-block-width')
          return value === 'content' || value === 'wide' || value === 'full-bleed' ? value : 'content'
        },
        renderHTML: (attrs) => ({ 'data-block-width': attrs.blockWidth ?? 'content' })
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

      mediaPosition: {
        default: 'left',
        parseHTML: (el) => el.getAttribute('data-media-position') ?? 'left',
        renderHTML: (attrs) => ({ 'data-media-position': attrs.mediaPosition ?? 'left' })
      },
      layoutPreset: {
        default: 'equal',
        parseHTML: el => importedLayoutPreset(presentationHtmlAttrs(el), 2, true),
        renderHTML: attrs => ({ 'data-layout-preset': attrs.layoutPreset })
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

