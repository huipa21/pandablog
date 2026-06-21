import Highlight from '@tiptap/extension-highlight'

import { highlightStyleString, normalizeHighlightColor } from '~/utils/highlightColors'

/**
 * Highlight mark that renders theme-adaptive, contrast-guaranteed colours.
 *
 * The stored `color` attribute is a single theme-independent seed colour. On
 * render we emit the four highlight CSS variables (light/dark background + text)
 * so the editor DOM matches the public post exactly and flips correctly when the
 * reader toggles theme. See utils/highlightColors.ts and assets/css/main.css.
 */
export const HighlightEnhanced = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-color') || element.style.backgroundColor || null,
        renderHTML: (attributes) => {
          if (!attributes.color) {
            return {}
          }

          const seed = normalizeHighlightColor(attributes.color)
          return {
            'data-color': seed,
            style: highlightStyleString(seed)
          }
        }
      }
    }
  }
})

export default HighlightEnhanced
