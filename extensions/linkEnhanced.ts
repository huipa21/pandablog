import Link from '@tiptap/extension-link'

type LinkOpenMode = 'same-tab' | 'new-tab' | 'new-window'

function normalizeOpenMode(rawMode: unknown, target: unknown): LinkOpenMode {
  if (rawMode === 'new-tab' || rawMode === 'new-window' || rawMode === 'same-tab') {
    return rawMode
  }

  return target === '_blank' ? 'new-tab' : 'same-tab'
}

export const LinkEnhanced = Link.extend({
  addAttributes() {
    const parent = this.parent?.() ?? {}

    return {
      ...parent,
      openMode: {
        default: 'same-tab',
        parseHTML: (element: HTMLElement) => normalizeOpenMode(element.getAttribute('data-open-mode'), element.getAttribute('target')),
        renderHTML: (attributes: Record<string, unknown>) => {
          const openMode = normalizeOpenMode(attributes.openMode, attributes.target)
          return openMode === 'same-tab' ? {} : { 'data-open-mode': openMode }
        }
      }
    }
  }
})
