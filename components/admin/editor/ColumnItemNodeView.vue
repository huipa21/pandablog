<template>
  <NodeViewWrapper class="columns-block-column" data-type="column-item" :data-header="header || undefined">
    <div v-if="header" class="columns-block-header" contenteditable="false">{{ header }}</div>
    <NodeViewContent class="columns-block-content" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const header = computed(() => String(props.node.attrs.header ?? '').trim())
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