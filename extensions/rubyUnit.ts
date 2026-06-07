import { mergeAttributes, Node } from '@tiptap/core'

export type AnnotLang = 'cmn' | 'yue' | 'jpn'

const SUPPORTED_LANGS: AnnotLang[] = ['cmn', 'yue', 'jpn']

export function isAnnotLang(value: unknown): value is AnnotLang {
  return typeof value === 'string' && (SUPPORTED_LANGS as string[]).includes(value)
}

export const DEFAULT_ANNOT_LANG: AnnotLang = 'cmn'

export interface RubyUnitAttrs {
  base: string
  reading: string
  lang: AnnotLang
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rubyUnit: {
      setRubyUnit: (attrs: RubyUnitAttrs) => ReturnType
    }
  }
}

/**
 * Inline atom node that pairs a `base` string with a phonetic `reading`.
 * Renders identical markup in editor and public surfaces:
 *   <ruby data-lang="cmn"><rb>你</rb><rt>nǐ</rt></ruby>
 *
 * The atom node guarantees the base + reading travel together (one undo
 * removes the whole annotation, edits do not split the pair).
 */
export const RubyUnit = Node.create({
  name: 'rubyUnit',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      base: {
        default: '',
        parseHTML: (element) => {
          if (!(element instanceof HTMLElement)) return ''
          const rb = element.querySelector('rb')
          if (rb?.textContent) return rb.textContent
          // Fallback: ruby's first text node minus any <rt>
          const clone = element.cloneNode(true) as HTMLElement
          clone.querySelectorAll('rt, rp').forEach((node) => node.remove())
          return clone.textContent ?? ''
        },
        renderHTML: () => ({})
      },
      reading: {
        default: '',
        parseHTML: (element) => {
          if (!(element instanceof HTMLElement)) return ''
          const rt = element.querySelector('rt')
          return rt?.textContent ?? ''
        },
        renderHTML: () => ({})
      },
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
        tag: 'ruby[data-lang]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false
          // Only consume <ruby> elements that actually carry a reading.
          if (!element.querySelector('rt')) return false
          return null
        }
      }
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const base = String(node.attrs.base ?? '')
    const reading = String(node.attrs.reading ?? '')
    return [
      'ruby',
      mergeAttributes(HTMLAttributes, { class: 'ruby-unit' }),
      ['rb', {}, base],
      ['rt', {}, reading]
    ]
  },

  addCommands() {
    return {
      setRubyUnit: (attrs) => ({ commands }) => {
        if (!attrs.base) return false
        return commands.insertContent({
          type: this.name,
          attrs: {
            base: attrs.base,
            reading: attrs.reading ?? '',
            lang: isAnnotLang(attrs.lang) ? attrs.lang : DEFAULT_ANNOT_LANG
          }
        })
      }
    }
  }
})
