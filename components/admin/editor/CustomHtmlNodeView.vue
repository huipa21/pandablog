<template>
  <NodeViewWrapper class="customhtml-nodeview my-4 overflow-hidden rounded-lg border border-stone-300 bg-white" data-node-view-wrapper>
    <div class="flex items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-3 py-1.5 text-xs" contenteditable="false">
      <div class="flex items-center gap-2 text-stone-500">
        <UIcon name="i-lucide-file-code-2" class="size-3.5" />
        <span class="font-medium">Custom HTML</span>
      </div>
      <div class="inline-flex overflow-hidden rounded border border-stone-200">
        <button
          type="button"
          class="px-2 py-0.5 text-xs"
          :class="mode === 'raw' ? 'bg-teal-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-100'"
          @click="mode = 'raw'"
        >Raw</button>
        <button
          type="button"
          class="px-2 py-0.5 text-xs"
          :class="mode === 'preview' ? 'bg-teal-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-100'"
          @click="mode = 'preview'"
        >Preview</button>
      </div>
    </div>
    <div v-if="mode === 'raw'" class="codeblock-body" data-theme="vs-dark">
      <pre class="hljs"><code
        ref="codeEl"
        class="language-html"
        contenteditable="true"
        spellcheck="false"
        @input="onCodeInput"
        v-text="html"
      /></pre>
    </div>
    <div v-else class="p-4" v-html="sanitizedHtml" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const mode = ref<'raw' | 'preview'>('raw')
const html = computed(() => typeof props.node.attrs.html === 'string' ? props.node.attrs.html : '')
const codeEl = ref<HTMLElement | null>(null)

const sanitizedHtml = computed(() => sanitize(html.value))

function onCodeInput(event: Event) {
  const text = (event.target as HTMLElement).innerText
  props.updateAttributes({ html: text })
}

function sanitize(input: string) {
  // Basic safety filter: remove script tags + on* attributes. For full safety,
  // public rendering uses DOMPurify; this preview is lighter weight.
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/ on[a-z]+="[^"]*"/gi, '')
    .replace(/ on[a-z]+='[^']*'/gi, '')
}
</script>

<style scoped>
.codeblock-body {
  background: #1e1e1e;
  color: #d4d4d4;
}

pre {
  margin: 0;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  font-size: 0.875rem;
  line-height: 1.6;
}

pre :deep(code) {
  display: block;
  background: transparent;
  white-space: pre-wrap;
  outline: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
