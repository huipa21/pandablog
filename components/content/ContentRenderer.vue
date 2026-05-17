<template>
  <ContentText v-if="node.type === 'text'" :text="node.text ?? ''" :marks="node.marks" />
  <br v-else-if="node.type === 'hardBreak'">
  <hr v-else-if="node.type === 'horizontalRule'" class="my-8 border-stone-200">
  <NodeImage v-else-if="node.type === 'image'" :node="node" />
  <NodeCodeBlock v-else-if="node.type === 'codeBlock'" :node="node" />
  <NodeMermaid v-else-if="node.type === 'mermaid'" :node="node" />
  <NodeWikiLink v-else-if="node.type === 'wikiLink'" :node="node" />
  <component :is="tag" v-else :class="nodeClass">
    <ContentRenderer v-for="(child, index) in node.content ?? []" :key="index" :node="child" />
  </component>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'

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
    default:
      return undefined
  }
})

function headingTag(level: unknown) {
  const safeLevel = Number(level)
  if ([1, 2, 3].includes(safeLevel)) {
    return `h${safeLevel}`
  }
  return 'h2'
}
</script>