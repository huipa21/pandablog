<template>
  <NodeViewWrapper as="span" class="inline-flex">
    <button
      type="button"
      class="related-post-chip inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 hover:bg-teal-100"
      @click="openPicker"
    >
      <UIcon name="i-lucide-link" class="size-3" />
      <span>{{ label || target || 'Pick a post' }}</span>
    </button>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()

const target = computed(() => String(props.node.attrs?.target ?? ''))
const label = computed(() => String(props.node.attrs?.label ?? ''))

function openPicker() {
  // Bubble up to BlockEditor's relatedPost picker handler.
  const view = props.editor.view
  view.dom.dispatchEvent(new CustomEvent('related-post:edit', {
    bubbles: true,
    detail: {
      pos: props.getPos?.(),
      target: target.value,
      label: label.value
    }
  }))
}
</script>
