import { mergeAttributes, Node } from '@tiptap/core'

export const FilesBlockNode = Node.create({
  name: 'filesBlock',
  group: 'block',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      files: {
        default: [],
        parseHTML: (el) => parseFiles(el.getAttribute('data-files')),
        renderHTML: (attrs) => {
          const files = Array.isArray(attrs.files) ? attrs.files : []
          return files.length ? { 'data-files': JSON.stringify(files) } : {}
        }
      },
      blockWidth: {
        default: 'content',
        parseHTML: (el) => normalizeBlockWidth(el.getAttribute('data-block-width')),
        renderHTML: (attrs) => ({ 'data-block-width': normalizeBlockWidth(attrs.blockWidth) })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="files-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'files-block', class: 'files-block' })]
  }
})

function parseFiles(value: string | null) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeBlockWidth(value: unknown) {
  const normalized = String(value ?? 'content')
  return normalized === 'wide' || normalized === 'full-bleed' ? normalized : 'content'
}