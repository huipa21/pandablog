<template>
  <NodeViewWrapper class="columns-block" data-type="columns-block" :data-columns="columnCount" :data-layout-preset="preset" :data-show-headers="showHeaders ? 'true' : 'false'" :data-block-width="blockWidth" :style="blockStyle" @keydown.delete="handleKeyboardDelete" @keydown.backspace="handleKeyboardDelete">
    <NodeViewContent class="columns-block-grid" :style="gridStyle" />
  </NodeViewWrapper>
</template>
<script setup lang="ts">
import { NodeSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { importedLayoutPreset, layoutWeights } from '~/utils/blockPresentation'
import { contentBlockWidthStyle } from '~/utils/contentBlockWidth'
import '~/assets/css/columns-block.css'
const props = defineProps(nodeViewProps)
const columnCount = computed(() => Math.max(2, Math.min(6, props.node.childCount || Number(props.node.attrs.columns) || 2)))
const preset = computed(() => importedLayoutPreset(props.node.attrs, columnCount.value))
const showHeaders = computed(() => props.node.attrs.showHeaders !== false)
const blockWidth = computed(() => String(props.node.attrs.blockWidth ?? 'content'))
const blockStyle = computed(() => contentBlockWidthStyle(blockWidth.value))
const gridStyle = computed(() => ({ gridTemplateColumns: layoutWeights(preset.value, columnCount.value).map(weight => `minmax(0, ${weight}fr)`).join(' ') }))
function handleKeyboardDelete(event: KeyboardEvent) {
  const selection = props.editor.state.selection
  const pos = typeof props.getPos === 'function' ? props.getPos() : null
  if (selection instanceof NodeSelection && selection.from === pos && selection.node.type.name === 'columnsBlock') event.preventDefault()
}
</script>
