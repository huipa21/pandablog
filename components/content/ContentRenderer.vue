<template>
  <div v-if="node.type === 'doc'" class="pb-prose">
    <ContentRenderer v-for="(child, index) in visibleDocChildren" :key="index" :node="child" />
  </div>
  <ContentText v-else-if="node.type === 'text'" :text="node.text ?? ''" :marks="node.marks" />
  <br v-else-if="node.type === 'hardBreak'">
    <hr v-else-if="horizontalRuleEnabled && node.type === 'horizontalRule'" class="w-full" :style="separatorStyle">
    <NodeImage v-else-if="NodeImage && node.type === 'image'" :node="node" />
    <NodeCodeBlock v-else-if="NodeCodeBlock && node.type === 'codeBlock'" :node="node" />
    <NodeDiffBlock v-else-if="NodeDiffBlock && node.type === 'diffBlock'" :node="node" />
    <NodeMermaid v-else-if="NodeMermaid && node.type === 'mermaid'" :node="node" />
    <NodeBlockMath v-else-if="NodeBlockMath && node.type === 'blockMath'" :node="node" />
    <NodeRubyUnit v-else-if="NodeRubyUnit && node.type === 'rubyUnit'" :node="node" />
    <NodeInlineMath v-else-if="NodeInlineMath && node.type === 'inlineMath'" :node="node" />
    <NodeAnnotationBlock v-else-if="NodeAnnotationBlock && node.type === 'annotationBlock'" :node="node" />
    <NodeCustomHtml v-else-if="NodeCustomHtml && node.type === 'customHtml'" :node="node" />
    <NodeVideoEmbed v-else-if="NodeVideoEmbed && node.type === 'videoEmbed'" :node="node" />
    <NodeMediaText v-else-if="NodeMediaText && node.type === 'mediaText'" :node="node" />
    <NodeFilesBlock v-else-if="NodeFilesBlock && node.type === 'filesBlock'" :node="node" />
    <NodeColumnsBlock v-else-if="NodeColumnsBlock && node.type === 'columnsBlock'" :node="node" />
    <NodeTabsBlock v-else-if="NodeTabsBlock && node.type === 'tabsBlock'" :node="node" />
    <NodeAccordionBlock v-else-if="NodeAccordionBlock && node.type === 'accordionBlock'" :node="node" />
    <NodeQuoteBlock v-else-if="NodeQuoteBlock && node.type === 'blockquote'" :node="node" />
    <NodeFootnotesBlock v-else-if="NodeFootnotesBlock && node.type === 'footnotesBlock'" :node="node" />
  <div v-else-if="isDisabledKnownBlock" class="disabled-content-block" role="note">
    {{ disabledBlockLabel }}
  </div>
  <component :is="tag" v-else :id="nodeId" :class="nodeClass">
    <ContentRenderer v-for="(child, index) in node.content ?? []" :key="index" :node="child" />
  </component>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import { DEFAULT_SEPARATOR_COLOR } from '~/extensions/separator'

const horizontalRuleEnabled = __PB_BLOCK_HORIZONTAL_RULE__
const NodeImage = __PB_BLOCK_IMAGE__ ? defineAsyncComponent(() => import('./NodeImage.vue')) : null
const NodeCodeBlock = __PB_BLOCK_CODE_BLOCK__ ? defineAsyncComponent(() => import('./NodeCodeBlock.vue')) : null
const NodeDiffBlock = __PB_BLOCK_DIFF_BLOCK__ ? defineAsyncComponent(() => import('./NodeDiffBlock.vue')) : null
const NodeMermaid = __PB_BLOCK_MERMAID__ ? defineAsyncComponent(() => import('./NodeMermaid.vue')) : null
const NodeBlockMath = __PB_BLOCK_BLOCK_MATH__ ? defineAsyncComponent(() => import('./NodeBlockMath.vue')) : null
const NodeRubyUnit = __PB_BLOCK_ANNOTATION_BLOCK__ ? defineAsyncComponent(() => import('./NodeRubyUnit.vue')) : null
const NodeInlineMath = __PB_BLOCK_INLINE_MATH__ ? defineAsyncComponent(() => import('./NodeInlineMath.vue')) : null
const NodeAnnotationBlock = __PB_BLOCK_ANNOTATION_BLOCK__ ? defineAsyncComponent(() => import('./NodeAnnotationBlock.vue')) : null
const NodeCustomHtml = __PB_BLOCK_CUSTOM_HTML__ ? defineAsyncComponent(() => import('./NodeCustomHtml.vue')) : null
const NodeVideoEmbed = __PB_BLOCK_VIDEO_EMBED__ ? defineAsyncComponent(() => import('./NodeVideoEmbed.vue')) : null
const NodeMediaText = __PB_BLOCK_MEDIA_TEXT__ ? defineAsyncComponent(() => import('./NodeMediaText.vue')) : null
const NodeFilesBlock = __PB_BLOCK_FILES_BLOCK__ ? defineAsyncComponent(() => import('./NodeFilesBlock.vue')) : null
const NodeColumnsBlock = __PB_BLOCK_COLUMNS_BLOCK__ ? defineAsyncComponent(() => import('./NodeColumnsBlock.vue')) : null
const NodeTabsBlock = __PB_BLOCK_TABS_BLOCK__ ? defineAsyncComponent(() => import('./NodeTabsBlock.vue')) : null
const NodeAccordionBlock = __PB_BLOCK_ACCORDION_BLOCK__ ? defineAsyncComponent(() => import('./NodeAccordionBlock.vue')) : null
const NodeQuoteBlock = __PB_BLOCK_BLOCKQUOTE__ ? defineAsyncComponent(() => import('./NodeQuoteBlock.vue')) : null
const NodeFootnotesBlock = __PB_BLOCK_FOOTNOTES_BLOCK__ ? defineAsyncComponent(() => import('./NodeFootnotesBlock.vue')) : null
const disabledBlockTypes = new Set([
  !__PB_BLOCK_IMAGE__ ? 'image' : '',
  !__PB_BLOCK_CODE_BLOCK__ ? 'codeBlock' : '',
  !__PB_BLOCK_DIFF_BLOCK__ ? 'diffBlock' : '',
  !__PB_BLOCK_MERMAID__ ? 'mermaid' : '',
  !__PB_BLOCK_BLOCK_MATH__ ? 'blockMath' : '',
  !__PB_BLOCK_INLINE_MATH__ ? 'inlineMath' : '',
  !__PB_BLOCK_ANNOTATION_BLOCK__ ? 'annotationBlock' : '',
  !__PB_BLOCK_CUSTOM_HTML__ ? 'customHtml' : '',
  !__PB_BLOCK_VIDEO_EMBED__ ? 'videoEmbed' : '',
  !__PB_BLOCK_MEDIA_TEXT__ ? 'mediaText' : '',
  !__PB_BLOCK_FILES_BLOCK__ ? 'filesBlock' : '',
  !__PB_BLOCK_COLUMNS_BLOCK__ ? 'columnsBlock' : '',
  !__PB_BLOCK_TABS_BLOCK__ ? 'tabsBlock' : '',
  !__PB_BLOCK_ACCORDION_BLOCK__ ? 'accordionBlock' : '',
  !__PB_BLOCK_BLOCKQUOTE__ ? 'blockquote' : '',
  !__PB_BLOCK_FOOTNOTES_BLOCK__ ? 'footnotesBlock' : '',
  !__PB_BLOCK_HORIZONTAL_RULE__ ? 'horizontalRule' : ''
].filter(Boolean))

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

const isDisabledKnownBlock = computed(() => disabledBlockTypes.has(props.node.type ?? ''))
const disabledBlockLabel = computed(() => `Disabled content block: ${props.node.type ?? 'unknown'}`)


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
</script>

<style scoped>
.disabled-content-block {
  margin: 1rem 0;
  border: 1px dashed var(--pb-divider-strong);
  border-radius: var(--pb-radius-card-inner);
  background: var(--pb-surface-subtle);
  padding: 0.875rem 1rem;
  color: var(--pb-text-muted);
  font-size: 0.875rem;
}
</style>