<template>
  <NodeViewWrapper class="mermaid-nodeview my-4 overflow-hidden rounded-lg border border-stone-300 bg-white" data-node-view-wrapper>
    <div class="mermaid-titlebar" contenteditable="false">
      <div class="flex items-center gap-2 text-xs font-medium text-stone-600">
        <UIcon name="i-lucide-git-fork" class="size-4" />
        <span>Mermaid</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-for="m in modes"
          :key="m"
          type="button"
          class="mermaid-mode-btn"
          :class="{ active: viewMode === m }"
          @click="viewMode = m"
        >{{ m }}</button>
      </div>
    </div>

    <div class="mermaid-body" :class="`mode-${viewMode}`" contenteditable="false">
      <div v-if="viewMode !== 'preview'" class="mermaid-editor-pane">
        <textarea
          ref="textareaEl"
          :value="code"
          class="mermaid-textarea"
          spellcheck="false"
          placeholder="graph TD;&#10;  A[Start] --> B[End]"
          @input="updateCode"
          @keydown.tab.prevent="onTab"
        />
      </div>
      <div v-if="viewMode !== 'code'" class="mermaid-preview-pane">
        <div v-if="error" class="mermaid-error">{{ error }}</div>
        <div v-else-if="!code.trim()" class="mermaid-empty">Diagram preview appears here.</div>
        <div v-else ref="previewEl" class="mermaid-preview" />
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

type MermaidModule = (typeof import('mermaid'))['default']

let mermaidPromise: Promise<MermaidModule> | null = null
let mermaidInitialized = false

const props = defineProps(nodeViewProps)

const code = computed(() => typeof props.node.attrs.code === 'string' ? props.node.attrs.code : '')
const modes = ['split', 'code', 'preview'] as const
const viewMode = ref<typeof modes[number]>('split')
const error = ref('')

const textareaEl = ref<HTMLTextAreaElement | null>(null)
const previewEl = ref<HTMLElement | null>(null)

function updateCode(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  props.updateAttributes({ code: textarea.value })
}

function onTab(event: KeyboardEvent) {
  const t = event.target as HTMLTextAreaElement
  const start = t.selectionStart
  const end = t.selectionEnd
  const next = `${t.value.slice(0, start)}  ${t.value.slice(end)}`
  props.updateAttributes({ code: next })
  nextTick(() => {
    if (textareaEl.value) {
      textareaEl.value.selectionStart = textareaEl.value.selectionEnd = start + 2
    }
  })
}

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default)
  }
  const mermaid = await mermaidPromise
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'default'
    })
    mermaidInitialized = true
  }
  return mermaid
}

let renderToken = 0
async function renderPreview() {
  if (!code.value.trim()) {
    error.value = ''
    return
  }
  const token = ++renderToken
  try {
    const mermaid = await loadMermaid()
    await nextTick()
    if (token !== renderToken || !previewEl.value) return
    const id = `mermaid-edit-${Math.random().toString(36).slice(2)}`
    const { svg } = await mermaid.render(id, code.value)
    if (token !== renderToken || !previewEl.value) return
    previewEl.value.innerHTML = svg
    error.value = ''
  } catch (err) {
    if (token !== renderToken) return
    error.value = err instanceof Error ? err.message : 'Failed to render diagram.'
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch([code, viewMode], () => {
  if (viewMode.value === 'code') return
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => { void renderPreview() }, 200)
}, { immediate: true })

onBeforeUnmount(() => {
  if (debounce) clearTimeout(debounce)
})
</script>

<style scoped>
.mermaid-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: rgb(245 245 244);
  border-bottom: 1px solid rgb(231 229 228);
}

.mermaid-mode-btn {
  padding: 0.15rem 0.5rem;
  font-size: 0.7rem;
  text-transform: capitalize;
  border-radius: 0.25rem;
  color: rgb(87 83 78);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
}

.mermaid-mode-btn:hover {
  background: rgb(231 229 228);
}

.mermaid-mode-btn.active {
  background: white;
  color: rgb(15 118 110);
  border-color: rgb(231 229 228);
}

.mermaid-body {
  display: grid;
  gap: 1px;
  background: rgb(231 229 228);
  min-height: 12rem;
}

.mermaid-body.mode-split {
  grid-template-columns: 1fr 1fr;
}

.mermaid-body.mode-code,
.mermaid-body.mode-preview {
  grid-template-columns: 1fr;
}

@media (max-width: 720px) {
  .mermaid-body.mode-split {
    grid-template-columns: 1fr;
  }
}

.mermaid-editor-pane,
.mermaid-preview-pane {
  background: white;
}

.mermaid-textarea {
  width: 100%;
  min-height: 12rem;
  height: 100%;
  padding: 0.75rem 1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  resize: vertical;
  border: 0;
  outline: none;
  background: transparent;
  color: rgb(41 37 36);
}

.mermaid-preview-pane {
  padding: 0.75rem;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mermaid-preview {
  width: 100%;
  text-align: center;
}

.mermaid-preview :deep(svg) {
  max-width: 100%;
  height: auto;
}

.mermaid-error {
  color: rgb(190 18 60);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  white-space: pre-wrap;
  padding: 0.5rem;
  background: rgb(254 226 226);
  border-radius: 0.375rem;
  width: 100%;
}

.mermaid-empty {
  color: rgb(168 162 158);
  font-size: 0.85rem;
}
</style>