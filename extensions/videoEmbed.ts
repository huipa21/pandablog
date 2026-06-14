import { mergeAttributes, Node, nodePasteRule } from '@tiptap/core'
import { resolveVideoEmbed, YOUTUBE_URL_REGEX } from '~/utils/videoEmbed'

export const VideoEmbedNode = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: {
        default: 'youtube',
        parseHTML: element => element.getAttribute('data-provider') || 'youtube',
        renderHTML: attributes => ({ 'data-provider': attributes.provider || 'youtube' })
      },
      videoId: {
        default: '',
        parseHTML: element => element.getAttribute('data-video-id') || '',
        renderHTML: attributes => ({ 'data-video-id': attributes.videoId || '' })
      },
      start: {
        default: 0,
        parseHTML: element => Number(element.getAttribute('data-start') || 0),
        renderHTML: attributes => ({ 'data-start': Number(attributes.start || 0) })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="video-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'video-embed', class: 'video-embed-nodeview' })]
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: YOUTUBE_URL_REGEX,
        type: this.type,
        getAttributes: match => resolveVideoEmbed(match[0]) || false
      })
    ]
  }
})