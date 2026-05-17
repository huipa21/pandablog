import { mergeAttributes, Node, nodeInputRule } from '@tiptap/core'

const wikiLinkInputRegex = /\[\[([^\]]+)]]$/

export const WikiLinkNode = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      target: {
        default: ''
      },
      label: {
        default: ''
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="wiki-link"]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false
          }

          const label = element.textContent?.trim() ?? ''
          return {
            target: element.dataset.target ?? normalizeWikiTarget(label),
            label
          }
        }
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const target = normalizeWikiTarget(String(HTMLAttributes.target ?? HTMLAttributes.label ?? ''))
    const label = String(HTMLAttributes.label || HTMLAttributes.target || target)

    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'wiki-link',
        'data-target': target,
        href: `/concept/${target}`
      }),
      label
    ]
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: wikiLinkInputRegex,
        type: this.type,
        getAttributes: (match) => {
          const label = (match[1] ?? '').trim()
          return {
            target: normalizeWikiTarget(label),
            label
          }
        }
      })
    ]
  }
})

export function normalizeWikiTarget(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 96)
}