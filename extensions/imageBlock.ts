import { mergeAttributes, Node } from '@tiptap/core'
import { importedImagePreset, presentationHtmlAttrs, type ImagePreset } from '~/utils/blockPresentation'

export interface ImageBlockAttrs {
  src: string
  alt: string
  title: string
  titlePosition: 'none' | 'top' | 'bottom'
  sizePreset: ImagePreset
  naturalWidth: number | null
  naturalHeight: number | null
  imageSources: unknown
  align: 'left' | 'center' | 'right'
}

export const ImageBlockNode = Node.create({
  name: 'image', group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes() {
    return {
      src: { default: '' }, alt: { default: '' }, title: { default: '' },
      titlePosition: {
        default: 'bottom',
        parseHTML: el => el.getAttribute('data-title-position') ?? 'bottom',
        renderHTML: attrs => ({ 'data-title-position': attrs.titlePosition })
      },
      sizePreset: {
        default: 'full',
        parseHTML: el => importedImagePreset(presentationHtmlAttrs(el)),
        renderHTML: attrs => ({ 'data-size-preset': attrs.sizePreset })
      },
      naturalWidth: { default: null, parseHTML: el => Number(el.getAttribute('data-natural-width')) || null, renderHTML: attrs => attrs.naturalWidth ? { 'data-natural-width': String(attrs.naturalWidth) } : {} },
      naturalHeight: { default: null, parseHTML: el => Number(el.getAttribute('data-natural-height')) || null, renderHTML: attrs => attrs.naturalHeight ? { 'data-natural-height': String(attrs.naturalHeight) } : {} },
      imageSources: { default: null, rendered: false },
      align: {
        default: 'center',
        parseHTML: el => el.getAttribute('data-align') ?? 'center',
        renderHTML: attrs => ({ 'data-align': attrs.align })
      }
    }
  },
  parseHTML() { return [{ tag: 'img[src]' }, { tag: 'figure[data-type="image"] img', priority: 60 }] },
  renderHTML({ HTMLAttributes }) { return ['img', mergeAttributes(HTMLAttributes)] }
})
