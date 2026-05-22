<template>
  <ContentText v-if="node.type === 'text'" :text="node.text ?? ''" :marks="node.marks" />
  <br v-else-if="node.type === 'hardBreak'">
  <hr v-else-if="node.type === 'horizontalRule'" class="my-8 border-stone-200">
  <NodeImage v-else-if="node.type === 'image'" :node="node" />
  <NodeCodeBlock v-else-if="node.type === 'codeBlock'" :node="node" />
  <NodeMermaid v-else-if="node.type === 'mermaid'" :node="node" />
  <NodeWikiLink v-else-if="node.type === 'wikiLink'" :node="node" />
  <NodeCustomHtml v-else-if="node.type === 'customHtml'" :node="node" />
  <NodeMediaText v-else-if="node.type === 'mediaText'" :node="node" />
  <component :is="tag" v-else :id="nodeId" :class="nodeClass">
    <ContentRenderer v-for="(child, index) in node.content ?? []" :key="index" :node="child" />
  </component>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import NodeCodeBlock from './NodeCodeBlock.vue'
import NodeCustomHtml from './NodeCustomHtml.vue'
import NodeImage from './NodeImage.vue'
import NodeMediaText from './NodeMediaText.vue'
import NodeMermaid from './NodeMermaid.vue'
import NodeWikiLink from './NodeWikiLink.vue'

const props = defineProps<{
  node: JsonContent
}>()

const tag = computed(() => {
  switch (props.node.type) {
    case 'doc':
      return 'div'
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
    default:
      return 'div'
  }
})

const nodeClass = computed(() => {
  switch (props.node.type) {
    case 'doc':
      return 'content-body'
    case 'bulletList':
      return 'list-disc pl-6'
    case 'orderedList':
      return 'list-decimal pl-6'
    case 'blockquote':
      return 'border-l-4 border-teal-600 pl-4 text-stone-700'
    case 'table':
      return 'my-6 w-full border-collapse overflow-hidden rounded-lg text-sm'
    case 'tableHeader':
      return 'border border-stone-200 bg-stone-100 p-3 text-left font-semibold'
    case 'tableCell':
      return 'border border-stone-200 p-3 align-top'
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