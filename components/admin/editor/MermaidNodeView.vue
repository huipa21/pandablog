<template>
  <NodeViewWrapper class="mermaid-nodeview my-4 overflow-hidden" data-node-view-wrapper>
    <div v-if="viewMode !== 'preview' || selected" class="mermaid-titlebar" contenteditable="false">
      <div class="mermaid-title flex items-center gap-2 text-xs font-medium">
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
          @keydown.down="onArrowDown"
        />
      </div>
      <div v-if="viewMode !== 'code'" class="mermaid-preview-pane">
        <div v-if="error" class="mermaid-error">{{ error }}</div>
        <div v-else-if="!code.trim()" class="mermaid-empty">{{ t('admin.editor.nodeViews.diagramPreview') }}</div>
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
const { t } = useI18n()

const code = computed(() => typeof props.node.attrs.code === 'string' ? props.node.attrs.code : '')
const modes = ['split', 'code', 'preview'] as const
const viewMode = ref<typeof modes[number]>('preview')
const selected = computed(() => Boolean(props.selected))
const error = ref('')

const textareaEl = ref<HTMLTextAreaElement | null>(null)
const previewEl = ref<HTMLElement | null>(null)

function updateCode(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  props.updateAttributes({ code: textarea.value })
}

function onArrowDown(event: KeyboardEvent) {
  const t = event.target as HTMLTextAreaElement
  if (t.value.slice(t.selectionEnd).includes('\n')) return
  event.preventDefault()
  const pos = typeof props.getPos === 'function' ? props.getPos() : undefined
  if (pos === undefined) return
  const after = pos + props.node.nodeSize
  const docSize = props.editor.state.doc.content.size
  props.editor.chain().focus().setTextSelection(Math.min(after + 1, docSize - 1)).run()
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
      securityLevel: 'strict',
      theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default'
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
    error.value = err instanceof Error ? err.message : t('admin.editor.nodeViews.renderDiagramFailed')
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
.mermaid-nodeview {
  border: 1px solid var(--pb-divider-strong);
  border-radius: var(--pb-radius-card-inner);
  background: var(--pb-card-bg);
  color: var(--pb-text);
}

.mermaid-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: var(--pb-surface-subtle);
  border-bottom: 1px solid var(--pb-divider);
}

.mermaid-title {
  color: var(--pb-text-muted);
}

.mermaid-mode-btn {
  padding: 0.15rem 0.5rem;
  font-size: 0.7rem;
  text-transform: capitalize;
  border-radius: 0.25rem;
  color: var(--pb-text-muted);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
}

.mermaid-mode-btn:hover {
  background: var(--pb-card-bg-hover);
}

.mermaid-mode-btn.active {
  background: var(--pb-selected-bg);
  color: var(--pb-primary);
  border-color: var(--pb-selected-border);
}

.mermaid-body {
  display: grid;
  gap: 1px;
  background: var(--pb-divider);
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
  background: var(--pb-card-bg);
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
  color: var(--pb-text);
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

:global([data-theme="dark"]) .mermaid-preview :deep(svg) {
  color: var(--pb-text);
}

:global([data-theme="dark"]) .mermaid-preview :deep(.edgePath .path),
:global([data-theme="dark"]) .mermaid-preview :deep(.flowchart-link),
:global([data-theme="dark"]) .mermaid-preview :deep(.relationshipLine),
:global([data-theme="dark"]) .mermaid-preview :deep(.er.relationshipLabelBox) {
  stroke: color-mix(in srgb, var(--pb-text) 58%, var(--pb-card-bg)) !important;
}

:global([data-theme="dark"]) .mermaid-preview :deep(.edgeLabel),
:global([data-theme="dark"]) .mermaid-preview :deep(.edgeLabel rect),
:global([data-theme="dark"]) .mermaid-preview :deep(.labelBkg) {
  background-color: var(--pb-card-bg) !important;
  fill: var(--pb-card-bg) !important;
  color: var(--pb-text-muted) !important;
}

:global([data-theme="dark"]) .mermaid-preview :deep(.edgeLabel),
:global([data-theme="dark"]) .mermaid-preview :deep(.edgeLabel span),
:global([data-theme="dark"]) .mermaid-preview :deep(.relationshipLabel) {
  color: var(--pb-text-muted) !important;
}

.mermaid-error {
  color: var(--color-danger, crimson);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  white-space: pre-wrap;
  padding: 0.5rem;
  background: color-mix(in srgb, var(--color-danger, crimson) 12%, var(--pb-card-bg));
  border-radius: 0.375rem;
  width: 100%;
}

.mermaid-empty {
  color: var(--pb-text-subtle);
  font-size: 0.85rem;
}
</style>