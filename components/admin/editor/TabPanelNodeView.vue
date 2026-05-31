<template>
  <NodeViewWrapper class="tabs-block-panel" data-type="tab-panel" :data-title="title">
    <NodeViewContent class="tabs-block-panel-content" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const title = computed(() => String(props.node.attrs.title ?? 'Tab').trim() || 'Tab')
</script>

<style scoped>
.tabs-block-panel {
  min-width: 0;
  border: 1px solid rgb(231 229 228);
  border-radius: 0.5rem;
  background: rgb(255 255 255);
}

.tabs-block-panel[hidden],
.tabs-block-panel[data-active="false"] {
  display: none;
}

.tabs-block-panel-content {
  min-width: 0;
  padding: 0.9rem;
}

.tabs-block-panel-content :deep(> :first-child) {
  margin-top: 0;
}

.tabs-block-panel-content :deep(> :last-child) {
  margin-bottom: 0;
}
</style>