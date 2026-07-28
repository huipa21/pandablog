import Link from '@tiptap/extension-link'

type LinkOpenMode = 'same-tab' | 'new-tab' | 'new-window'

function normalizeOpenMode(rawMode: unknown, target: unknown): LinkOpenMode {
  if (rawMode === 'new-tab' || rawMode === 'new-window' || rawMode === 'same-tab') {
    return rawMode
  }

  return target === '_blank' ? 'new-tab' : 'same-tab'
}

export const LinkEnhanced = Link.extend({
  // Decouple mark inclusivity from `autolink` (which the base extension ties
  // together). With `inclusive` false, typing/space/tab immediately after a
  // link produces plain text instead of extending the link. Autolink and
  // linkOnPaste keep working via their own append-transaction plugin.
  inclusive() {
    return false
  },

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
