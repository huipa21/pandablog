<template>
  <NodeViewWrapper class="my-4 rounded-lg border border-stone-300 bg-stone-50 p-3" data-node-view-wrapper>
    <div class="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-stone-500">
      <UIcon name="i-lucide-git-fork" class="size-4" />
      Mermaid
    </div>
    <textarea
      :value="code"
      class="min-h-36 w-full resize-y rounded-md border border-stone-300 bg-white p-3 font-mono text-sm outline-none focus:border-teal-500"
      spellcheck="false"
      @input="updateCode"
    />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const code = computed(() => typeof props.node.attrs.code === 'string' ? props.node.attrs.code : '')

function updateCode(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  props.updateAttributes({ code: textarea.value })
}
</script>