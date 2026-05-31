<template>
  <NodeViewWrapper
    class="columns-block-column"
    data-type="column-item"
    :data-header="header || undefined"
    :data-header-alignment="headerAlignment"
    @keydown.delete="handleKeyboardDelete"
    @keydown.backspace="handleKeyboardDelete"
  >
    <div v-if="header" class="columns-block-header" :class="`header-align-${headerAlignment}`" contenteditable="false">{{ header }}</div>
    <NodeViewContent class="columns-block-content" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const header = computed(() => String(props.node.attrs.header ?? '').trim())
const headerAlignment = computed(() => {
  const value = String(props.node.attrs.headerAlignment ?? 'left')
  return value === 'center' || value === 'right' ? value : 'left'
})

function handleKeyboardDelete(event: KeyboardEvent) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') {
    return
  }

  const selection = props.editor.state.selection
  if (!(selection instanceof NodeSelection)) {
    return
  }

  const pos = props.getPos()
  const nodePos = typeof pos === 'function' ? pos() : typeof pos === 'number' ? pos : null
  if (typeof nodePos !== 'number') {
    return
  }

  if (selection.from === nodePos && selection.node.type.name === 'columnItem') {
    event.preventDefault()
  }
}
</script>

<style scoped>
.columns-block-column {
  min-width: 0;
  border: 1px solid rgb(231 229 228);
  border-radius: 0.5rem;
  background: rgb(255 255 255);
  overflow: hidden;
}

.columns-block-header {
  border-bottom: 1px solid rgb(231 229 228);
  background: rgb(250 250 249);
  color: rgb(28 25 23);
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.35;
  padding: 0.65rem 0.85rem;
}

.columns-block-header.header-align-center {
  text-align: center;
}

.columns-block-header.header-align-right {
  text-align: right;
}

.columns-block-content {
  min-width: 0;
  padding: 0.85rem;
}

.columns-block-content :deep(> :first-child) {
  margin-top: 0;
}

.columns-block-content :deep(> :last-child) {
  margin-bottom: 0;
}
</style>
