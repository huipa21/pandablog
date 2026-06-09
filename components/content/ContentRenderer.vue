<template>
  <div v-if="node.type === 'doc'" class="pb-prose">
    <ContentRenderer v-for="(child, index) in visibleDocChildren" :key="index" :node="child" />
  </div>
  <ContentText v-else-if="node.type === 'text'" :text="node.text ?? ''" :marks="node.marks" />
  <br v-else-if="node.type === 'hardBreak'">
  <hr v-else-if="node.type === 'horizontalRule'" class="w-full" :style="separatorStyle">
  <NodeImage v-else-if="node.type === 'image'" :node="node" />
  <NodeCodeBlock v-else-if="node.type === 'codeBlock'" :node="node" />
  <NodeDiffBlock v-else-if="node.type === 'diffBlock'" :node="node" />
  <NodeMermaid v-else-if="node.type === 'mermaid'" :node="node" />
  <NodeRelatedPost v-else-if="node.type === 'relatedPost'" :node="node" />
  <NodeRubyUnit v-else-if="node.type === 'rubyUnit'" :node="node" />
  <NodeAnnotationBlock v-else-if="node.type === 'annotationBlock'" :node="node" />
  <NodeCustomHtml v-else-if="node.type === 'customHtml'" :node="node" />
  <NodeMediaText v-else-if="node.type === 'mediaText'" :node="node" />
  <NodeFilesBlock v-else-if="node.type === 'filesBlock'" :node="node" />
  <NodeColumnsBlock v-else-if="node.type === 'columnsBlock'" :node="node" />
  <NodeTabsBlock v-else-if="node.type === 'tabsBlock'" :node="node" />
  <NodeAccordionBlock v-else-if="node.type === 'accordionBlock'" :node="node" />
  <NodeQuoteBlock v-else-if="node.type === 'blockquote'" :node="node" />
  <NodeFootnotesBlock v-else-if="node.type === 'footnotesBlock'" :node="node" />
  <component :is="tag" v-else :id="nodeId" :class="nodeClass">
    <ContentRenderer v-for="(child, index) in node.content ?? []" :key="index" :node="child" />
  </component>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import { DEFAULT_SEPARATOR_COLOR } from '~/extensions/separator'
import NodeCodeBlock from './NodeCodeBlock.vue'
import NodeCustomHtml from './NodeCustomHtml.vue'
import NodeDiffBlock from './NodeDiffBlock.vue'
import NodeImage from './NodeImage.vue'
import NodeFootnotesBlock from './NodeFootnotesBlock.vue'
import NodeColumnsBlock from './NodeColumnsBlock.vue'
import NodeFilesBlock from './NodeFilesBlock.vue'
import NodeMediaText from './NodeMediaText.vue'
import NodeMermaid from './NodeMermaid.vue'
import NodeQuoteBlock from './NodeQuoteBlock.vue'
import NodeRelatedPost from './NodeRelatedPost.vue'
import NodeRubyUnit from './NodeRubyUnit.vue'
import NodeAnnotationBlock from './NodeAnnotationBlock.vue'
import NodeTabsBlock from './NodeTabsBlock.vue'
import NodeAccordionBlock from './NodeAccordionBlock.vue'

const props = defineProps<{
  node: JsonContent
}>()

const tag = computed(() => {
  switch (props.node.type) {
    case 'paragraph':
      return 'p'
    case 'heading':
      return headingTag(props.node.attrs?.level)
    case 'bulletList':
      return 'ul'
    case 'orderedList':
      return 'ol'
    case 'listItem':
      return 'li'
    case 'table':
      return 'table'
    case 'tableRow':
      return 'tr'
    case 'tableHeader':
      return 'th'
    case 'tableCell':
      return 'td'
    case 'blockquote':
      return 'blockquote'
    case 'footnotesBlock':
      return 'section'
    default:
      return 'div'
  }
})

const nodeClass = computed(() => {
  switch (props.node.type) {
    case 'doc':
      return 'pb-prose'
    case 'bulletList':
      return 'list-disc pl-6'
    case 'orderedList':
      return 'list-decimal pl-6'
    case 'blockquote':
      return 'border-l-4 border-[var(--pb-link)] pl-4 text-[var(--pb-text-muted)]'
    case 'table':
      return 'my-6 w-full border-collapse overflow-hidden rounded-[var(--pb-radius-lg)]'
    case 'tableHeader':
      return 'border border-[var(--pb-divider)] bg-[var(--pb-surface-subtle)] p-2 font-semibold'
    case 'tableCell':
      return 'border border-[var(--pb-divider)] p-2 align-top'
    case 'footnotesBlock':
      return 'footnotes-block'
    default:
      return undefined
  }
})

const nodeId = computed(() => {
  if (props.node.type !== 'heading') {
    return undefined
  }

  return slugifyHeading(flattenNodeText(props.node))
})

const visibleDocChildren = computed(() => {
  return props.node.content ?? []
})

const separatorStyle = computed(() => {
  if (props.node.type !== 'horizontalRule') {
    return undefined
  }

  const styleType = String(props.node.attrs?.styleType ?? 'solid')
  const thickness = Math.max(1, Number(props.node.attrs?.thickness ?? 1))
  const marginY = Math.max(0, Number(props.node.attrs?.marginY ?? 16))
  const color = String(props.node.attrs?.color ?? DEFAULT_SEPARATOR_COLOR)

  return {
    border: 0,
    borderTop: `${thickness}px ${styleType} ${color}`,
    margin: `${marginY}px 0`
  }
})


function headingTag(level: unknown) {
  const safeLevel = Number(level)
  if ([1, 2, 3, 4, 5, 6].includes(safeLevel)) {
    return `h${safeLevel}`
  }
  return 'h2'
}

function flattenNodeText(node: JsonContent): string {
  if (node.type === 'text') {
    return node.text ?? ''
  }

  return node.content?.map(flattenNodeText).join(' ') ?? ''
}

function slugifyHeading(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'section'
}
</script>