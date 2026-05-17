<template>
  <NodeViewWrapper as="span" class="wiki-link-editor" contenteditable="false">
    {{ label }}
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const label = computed(() => String(props.node.attrs.label || props.node.attrs.target || 'link'))
</script>