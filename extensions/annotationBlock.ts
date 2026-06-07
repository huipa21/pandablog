import { mergeAttributes, Node } from '@tiptap/core'
import { DEFAULT_ANNOT_LANG, isAnnotLang, type AnnotLang } from './rubyUnit'

export interface AnnotationBlockAttrs {
  lang: AnnotLang
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    annotationBlock: {
      setAnnotationBlock: (attrs?: Partial<AnnotationBlockAttrs>) => ReturnType
    }
  }
}

/**
 * Block-level container for inline-text annotations. Holds inline content
 * (text + rubyUnit nodes) and remembers the active annotation language so
 * the toolbar's "Annotate all" command knows which engine to dispatch.
 *
 * Renders identical markup on editor + public surfaces:
 *   <div class="annotation-block" data-lang="cmn">…inline content…</div>
 */
export const AnnotationBlockNode = Node.create({
  name: 'annotationBlock',
  group: 'block',
  content: 'inline*',
  defining: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      lang: {
        default: DEFAULT_ANNOT_LANG,
        parseHTML: (element) => {
          if (!(element instanceof HTMLElement)) return DEFAULT_ANNOT_LANG
          const raw = element.getAttribute('data-lang')
          return isAnnotLang(raw) ? raw : DEFAULT_ANNOT_LANG
        },
        renderHTML: (attributes) => ({
          'data-lang': isAnnotLang(attributes.lang) ? attributes.lang : DEFAULT_ANNOT_LANG
        })
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div.annotation-block'
      },
      {
        tag: 'div[data-type="annotation-block"]'
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'annotation-block',
        class: 'annotation-block'
      }),
      0
    ]
  },

  addCommands() {
    return {
      setAnnotationBlock: (attrs) => ({ commands }) => {
        const lang = isAnnotLang(attrs?.lang) ? attrs!.lang! : DEFAULT_ANNOT_LANG
        return commands.insertContent({
          type: this.name,
          attrs: { lang }
        })
      }
    }
  }
})
