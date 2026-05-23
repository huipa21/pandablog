<template>
  <NodeViewWrapper class="customhtml-nodeview my-4 overflow-hidden rounded-lg border border-stone-300 bg-white" data-node-view-wrapper>
    <div class="flex items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-3 py-1.5 text-xs" contenteditable="false">
      <div class="flex items-center gap-2 text-stone-500">
        <UIcon name="i-lucide-file-code-2" class="size-3.5" />
        <span class="font-medium">Custom HTML / Widget</span>
        <span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800" title="Scripts run inside a sandboxed iframe">JS allowed (sandboxed)</span>
      </div>
      <div class="inline-flex overflow-hidden rounded border border-stone-200">
        <button
          type="button"
          class="px-2 py-0.5 text-xs"
          :class="mode === 'raw' ? 'bg-teal-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-100'"
          @click="mode = 'raw'"
        >Source</button>
        <button
          type="button"
          class="px-2 py-0.5 text-xs"
          :class="mode === 'preview' ? 'bg-teal-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-100'"
          @click="mode = 'preview'"
        >Preview</button>
        <button
          type="button"
          class="px-2 py-0.5 text-xs"
          :class="mode === 'split' ? 'bg-teal-600 text-white' : 'bg-white text-stone-600 hover:bg-stone-100'"
          @click="mode = 'split'"
        >Split</button>
      </div>
    </div>
    <div class="customhtml-body" :class="`mode-${mode}`" contenteditable="false">
      <div v-if="mode !== 'preview'" class="customhtml-code">
        <pre class="customhtml-pre"><code
          ref="codeEl"
          class="language-html"
          contenteditable="true"
          spellcheck="false"
          @input="onCodeInput"
          v-text="html"
        /></pre>
      </div>
      <div v-if="mode !== 'raw'" class="customhtml-preview">
        <iframe
          ref="iframeEl"
          class="customhtml-iframe"
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          referrerpolicy="no-referrer"
          loading="lazy"
          :srcdoc="iframeDoc"
        />
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const mode = ref<'raw' | 'preview' | 'split'>('split')
const html = computed(() => typeof props.node.attrs.html === 'string' ? props.node.attrs.html : '')
const codeEl = ref<HTMLElement | null>(null)
const iframeEl = ref<HTMLIFrameElement | null>(null)

const iframeDoc = computed(() => buildSrcdoc(html.value))

function onCodeInput(event: Event) {
  const text = (event.target as HTMLElement).innerText
  props.updateAttributes({ html: text })
}

function buildSrcdoc(input: string) {
  // Wrap user content in a minimal document. The iframe is sandboxed so
  // JS executes but cannot access the parent page (no allow-same-origin).
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    html,body{margin:0;padding:0.5rem;font-family:ui-sans-serif,system-ui,sans-serif;color:#1c1917;background:transparent;}
    *{box-sizing:border-box;}
  </style></head><body>${input}</body></html>`
}
</script>

<style scoped>
.customhtml-body {
  display: grid;
  gap: 1px;
  background: rgb(231 229 228);
  min-height: 9rem;
}

.customhtml-body.mode-raw,
.customhtml-body.mode-preview {
  grid-template-columns: 1fr;
}

.customhtml-body.mode-split {
  grid-template-columns: 1fr 1fr;
}

@media (max-width: 720px) {
  .customhtml-body.mode-split {
    grid-template-columns: 1fr;
  }
}

.customhtml-code {
  background: #1e1e1e;
  color: #d4d4d4;
}

.customhtml-pre {
  margin: 0;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  font-size: 0.85rem;
  line-height: 1.5;
  min-height: 9rem;
}

.customhtml-pre :deep(code) {
  display: block;
  background: transparent;
  white-space: pre-wrap;
  outline: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: inherit;
  min-height: 9rem;
}

.customhtml-preview {
  background: white;
}

.customhtml-iframe {
  width: 100%;
  min-height: 9rem;
  height: 100%;
  border: 0;
  display: block;
}
</style>
