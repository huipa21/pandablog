import { mergeAttributes, Node } from '@tiptap/core'

/**
 * `relatedPost` is an inline atom node that links to another post by slug.
 * Replaces the previous `wikiLink`/concepts feature with a direct post→post
 * reference backed by the `links` edge in SurrealDB.
 */
export const RelatedPostNode = Node.create({
  name: 'relatedPost',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      target: { default: '' },
      label: { default: '' }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="related-post"]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false
          }
          return {
            target: element.dataset.target ?? '',
            label: element.textContent?.trim() ?? ''
          }
        }
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const target = String(HTMLAttributes.target ?? '').trim()
    const label = String(HTMLAttributes.label || target)

    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'related-post',
        'data-target': target,
        href: target ? `/blog/${target}` : '#'
      }),
      label
    ]
  }
})
