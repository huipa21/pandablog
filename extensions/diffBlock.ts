import { mergeAttributes, Node } from '@tiptap/core'
import {
  DEFAULT_DIFF_NEW_LABEL,
  DEFAULT_DIFF_NEW_TEXT,
  DEFAULT_DIFF_OLD_LABEL,
  DEFAULT_DIFF_OLD_TEXT,
  normalizeDiffLanguage
} from '~/utils/diffBlock'

export const DiffBlockNode = Node.create({
  name: 'diffBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      oldText: {
        default: DEFAULT_DIFF_OLD_TEXT,
        parseHTML: (element) => element.getAttribute('data-old-text') ?? DEFAULT_DIFF_OLD_TEXT,
        renderHTML: (attrs) => ({ 'data-old-text': String(attrs.oldText ?? DEFAULT_DIFF_OLD_TEXT) })
      },
      newText: {
        default: DEFAULT_DIFF_NEW_TEXT,
        parseHTML: (element) => element.getAttribute('data-new-text') ?? DEFAULT_DIFF_NEW_TEXT,
        renderHTML: (attrs) => ({ 'data-new-text': String(attrs.newText ?? DEFAULT_DIFF_NEW_TEXT) })
      },
      language: {
        default: 'plaintext',
        parseHTML: (element) => normalizeDiffLanguage(element.getAttribute('data-language')),
        renderHTML: (attrs) => ({ 'data-language': normalizeDiffLanguage(attrs.language) })
      },
      oldLabel: {
        default: DEFAULT_DIFF_OLD_LABEL,
        parseHTML: (element) => element.getAttribute('data-old-label') ?? DEFAULT_DIFF_OLD_LABEL,
        renderHTML: (attrs) => ({ 'data-old-label': String(attrs.oldLabel ?? DEFAULT_DIFF_OLD_LABEL) })
      },
      newLabel: {
        default: DEFAULT_DIFF_NEW_LABEL,
        parseHTML: (element) => element.getAttribute('data-new-label') ?? DEFAULT_DIFF_NEW_LABEL,
        renderHTML: (attrs) => ({ 'data-new-label': String(attrs.newLabel ?? DEFAULT_DIFF_NEW_LABEL) })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="diff-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'diff-block', class: 'diff-block' })]
  }
})
