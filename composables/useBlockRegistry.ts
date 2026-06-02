import type { JsonContent } from '~/types/content'
import {
  DEFAULT_DIFF_NEW_LABEL,
  DEFAULT_DIFF_OLD_LABEL,
} from '~/utils/diffBlock'

export type BlockCategory = 'text' | 'media' | 'design' | 'embed' | 'advanced'

export interface BlockDefinition {
  name: string
  title: string
  description: string
  icon: string
  category: BlockCategory
  keywords: string[]
  implemented: boolean
  hidden?: boolean
  supports: {
    align?: boolean
    color?: boolean
    typography?: boolean
    spacing?: boolean
    border?: boolean
  }
  createContent?: () => JsonContent
}

const blockCategories: Array<{ value: BlockCategory, label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'media', label: 'Media' },
  { value: 'design', label: 'Design' },
  { value: 'embed', label: 'Embeds' },
  { value: 'advanced', label: 'Advanced' }
]

const blockDefinitions: BlockDefinition[] = [
  {
    name: 'paragraph',
    title: 'Paragraph',
    description: 'Start with basic text.',
    icon: 'i-lucide-pilcrow',
    category: 'text',
    keywords: ['text', 'copy', 'body'],
    implemented: true,
    supports: { align: true, color: true, typography: true, spacing: true },
    createContent: () => ({ type: 'paragraph' })
  },
  {
    name: 'heading',
    title: 'Heading',
    description: 'Introduce a new section.',
    icon: 'i-lucide-heading',
    category: 'text',
    keywords: ['title', 'subtitle', 'h1', 'h2', 'h3'],
    implemented: true,
    supports: { align: true, color: true, typography: true, spacing: true },
    createContent: () => ({ type: 'heading', attrs: { level: 2 } })
  },
  {
    name: 'bulletList',
    title: 'Bullet List',
    description: 'Create an unordered list.',
    icon: 'i-lucide-list',
    category: 'text',
    keywords: ['ul', 'list', 'bullets'],
    implemented: true,
    supports: { spacing: true },
    createContent: () => ({
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }]
    })
  },
  {
    name: 'orderedList',
    title: 'Numbered List',
    description: 'Create an ordered list.',
    icon: 'i-lucide-list-ordered',
    category: 'text',
    keywords: ['ol', 'list', 'numbers'],
    implemented: true,
    supports: { spacing: true },
    createContent: () => ({
      type: 'orderedList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }]
    })
  },
  {
    name: 'blockquote',
    title: 'Quote',
    description: 'Highlight quoted text.',
    icon: 'i-lucide-quote',
    category: 'text',
    keywords: ['quote', 'citation'],
    implemented: true,
    supports: { color: true, spacing: true, border: true },
    createContent: () => ({
      type: 'blockquote',
      attrs: { style: 'bar', theme: '#0f766e', fontFamily: 'sans', fontSize: '1rem', fontColor: '#1c1917', backgroundColor: '', authorName: '', authorTitle: '' },
      content: [{ type: 'paragraph' }]
    })
  },
  {
    name: 'image',
    title: 'Image',
    description: 'Upload or insert an image.',
    icon: 'i-lucide-image-plus',
    category: 'media',
    keywords: ['photo', 'media', 'upload'],
    implemented: true,
    supports: { align: true, spacing: true, border: true },
    createContent: () => ({
      type: 'image',
      attrs: {
        src: '', alt: '', title: '', titlePosition: 'bottom',
        sourceSize: 'full', displaySize: 'fill-container', displayPercent: 100, displayPx: null,
        width: null, height: null, widthPercent: 100,
        naturalWidth: null, naturalHeight: null,
        lockAspect: true, align: 'center'
      }
    })
  },
  {
    name: 'mediaText',
    title: 'Media & Text',
    description: 'Place media beside written content.',
    icon: 'i-lucide-panel-left',
    category: 'media',
    keywords: ['columns', 'image', 'text'],
    implemented: true,
    supports: { spacing: true },
    createContent: () => ({
      type: 'mediaText',
      attrs: {
        mediaSrc: '', mediaAlt: '', mediaTitle: '', mediaTitlePosition: 'bottom',
        mediaSourceSize: 'full', mediaDisplaySize: 'fill-container', mediaDisplayPercent: 100, mediaDisplayPx: null,
        blockWidth: 'content',
        mediaWidth: null, mediaHeight: null, mediaWidthPercent: 100,
        mediaNaturalWidth: null, mediaNaturalHeight: null,
        lockAspect: true,
        mediaPosition: 'left', ratio: 0.5
      },
      content: [{ type: 'paragraph' }]
    })
  },
  {
    name: 'columnsBlock',
    title: 'Columns',
    description: 'Arrange blocks in up to six responsive columns.',
    icon: 'i-lucide-columns-3',
    category: 'design',
    keywords: ['columns', 'layout', 'grid', 'two column', 'three column'],
    implemented: true,
    supports: { spacing: true },
    createContent: () => ({
      type: 'columnsBlock',
      attrs: {
        columns: 2,
        proportions: '1-1',
        customPercentages: '',
        showHeaders: true,
        blockWidth: 'content',
        columnGap: '1rem',
        marginTop: '1rem',
        marginBottom: '1rem'
      },
      content: [
        { type: 'columnItem', attrs: { header: '' }, content: [{ type: 'paragraph' }] },
        { type: 'columnItem', attrs: { header: '' }, content: [{ type: 'paragraph' }] }
      ]
    })
  },
  {
    name: 'tabsBlock',
    title: 'Tabs',
    description: 'Group blocks into switchable tab panels.',
    icon: 'i-lucide-panel-top',
    category: 'design',
    keywords: ['tabs', 'panel', 'accordion', 'switcher'],
    implemented: true,
    supports: { spacing: true },
    createContent: () => ({
      type: 'tabsBlock',
      attrs: { orientation: 'horizontal', tabStyle: 'underline', blockWidth: 'content', activeIndex: 0 },
      content: [
        { type: 'tabPanel', attrs: { title: '' }, content: [{ type: 'paragraph' }] },
        { type: 'tabPanel', attrs: { title: '' }, content: [{ type: 'paragraph' }] }
      ]
    })
  },
  {
    name: 'table',
    title: 'Table',
    description: 'Insert a table with editable rows and columns.',
    icon: 'i-lucide-table',
    category: 'text',
    keywords: ['grid', 'rows', 'columns'],
    implemented: true,
    supports: { spacing: true, border: true }
  },
  {
    name: 'codeBlock',
    title: 'Code',
    description: 'Show highlighted code with a language.',
    icon: 'i-lucide-square-code',
    category: 'advanced',
    keywords: ['pre', 'snippet', 'programming'],
    implemented: true,
    supports: { spacing: true },
    createContent: () => ({
      type: 'codeBlock',
      attrs: { language: 'javascript', theme: 'github-dark', lineNumbers: true, lineHighlights: '', wrap: true, zoom: 1, collapsed: true },
      content: []
    })
  },
  {
    name: 'diffBlock',
    title: 'Diff',
    description: 'Compare two versions line by line.',
    icon: 'i-lucide-git-compare-arrows',
    category: 'advanced',
    keywords: ['diff', 'compare', 'before', 'after', 'config'],
    implemented: true,
    supports: { spacing: true },
    createContent: () => ({
      type: 'diffBlock',
      attrs: {
        oldText: '',
        newText: '',
        language: 'plaintext',
        oldLabel: DEFAULT_DIFF_OLD_LABEL,
        newLabel: DEFAULT_DIFF_NEW_LABEL
      }
    })
  },
  {
    name: 'mermaid',
    title: 'Mermaid',
    description: 'Create a diagram from Mermaid syntax.',
    icon: 'i-lucide-git-fork',
    category: 'advanced',
    keywords: ['diagram', 'flowchart', 'graph'],
    implemented: true,
    supports: { spacing: true },
    createContent: () => ({
      type: 'mermaid',
      attrs: { code: '' }
    })
  },
  {
    name: 'horizontalRule',
    title: 'Separator',
    description: 'Add a visual divider.',
    icon: 'i-lucide-minus',
    category: 'design',
    keywords: ['divider', 'rule', 'line'],
    implemented: true,
    supports: { spacing: true },
    createContent: () => ({
      type: 'horizontalRule',
      attrs: { styleType: 'solid', thickness: 1, marginY: 16, color: '#d6d3d1' }
    })
  },
  {
    name: 'footnotesBlock',
    title: 'Footnotes',
    description: 'Footnote lines linked to inline references.',
    icon: 'i-lucide-footprints',
    category: 'text',
    keywords: ['footnote', 'reference', 'notes'],
    implemented: true,
    hidden: true,
    supports: { spacing: true }
  },
  {
    name: 'embed',
    title: 'Embed',
    description: 'Embed content from a URL.',
    icon: 'i-lucide-globe-2',
    category: 'embed',
    keywords: ['url', 'oembed', 'iframe'],
    implemented: true,
    supports: { align: true, spacing: true },
    createContent: () => ({
      type: 'customHtml',
      attrs: { html: '' }
    })
  },
  {
    name: 'customHtml',
    title: 'Custom HTML',
    description: 'Write raw HTML with a preview.',
    icon: 'i-lucide-file-code-2',
    category: 'advanced',
    keywords: ['html', 'markup'],
    implemented: true,
    supports: { spacing: true },
    createContent: () => ({
      type: 'customHtml',
      attrs: { html: '' }
    })
  },
  {
    name: 'relatedPost',
    title: 'Related Post',
    description: 'Insert a link to another post (bidirectional).',
    icon: 'i-lucide-link',
    category: 'advanced',
    keywords: ['related', 'link', 'post', 'wiki'],
    implemented: true,
    supports: {}
  }
]

const visibleBlockDefinitions = blockDefinitions.filter((block) => !block.hidden)

const normalizedBlocks = visibleBlockDefinitions.map((block) => ({
  ...block,
  searchText: [block.title, block.description, block.name, ...block.keywords]
    .join(' ')
    .toLowerCase()
}))

export function useBlockRegistry() {
  function getBlockDefinition(name: string) {
    return blockDefinitions.find((block) => block.name === name) ?? null
  }

  function getBlocksByCategory(category: BlockCategory) {
    return visibleBlockDefinitions.filter((block) => block.category === category)
  }

  function searchBlocks(query: string) {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return visibleBlockDefinitions
    }

    return normalizedBlocks
      .filter((block) => block.searchText.includes(normalizedQuery))
      .map(({ searchText: _searchText, ...block }) => block)
  }

  return {
    categories: blockCategories,
    blocks: visibleBlockDefinitions,
    getBlockDefinition,
    getBlocksByCategory,
    searchBlocks
  }
}