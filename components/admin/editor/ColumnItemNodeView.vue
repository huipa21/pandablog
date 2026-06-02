<template>
  <NodeViewWrapper
    class="columns-block-column"
    data-type="column-item"
    :data-header="header || undefined"
    @keydown.delete="handleKeyboardDelete"
    @keydown.backspace="handleKeyboardDelete"
  >
    <div v-if="showHeaders" class="columns-block-header" contenteditable="false">
      <input
        class="columns-block-header-input"
        type="text"
        :value="header"
        placeholder="Column header"
        @mousedown.stop
        @keydown.stop
        @input="onHeaderInput"
      >
    </div>
    <NodeViewContent class="columns-block-content" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const header = computed(() => String(props.node.attrs.header ?? '').trim())
const showHeaders = computed(() => {
  const getPos = props.getPos as (() => number) | number | undefined
  const nodePos = typeof getPos === 'function' ? getPos() : typeof getPos === 'number' ? getPos : null
  if (typeof nodePos !== 'number') return true

  const $pos = props.editor.state.doc.resolve(nodePos)
  return $pos.parent?.attrs?.showHeaders !== false
})

function onHeaderInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  const nextHeader = String(target?.value ?? '').trim()
  props.updateAttributes({ header: nextHeader })
}

function handleKeyboardDelete(event: KeyboardEvent) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') {
    return
  }

  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    return
  }

  const selection = props.editor.state.selection
  if (!(selection instanceof NodeSelection)) {
    return
  }

  const getPos = props.getPos as (() => number) | number | undefined
  const nodePos = typeof getPos === 'function' ? getPos() : typeof getPos === 'number' ? getPos : null
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
  padding: 0.5rem 0.85rem;
}

.columns-block-header-input {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  padding: 0;
  outline: none;
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
