<template>
  <NodeViewWrapper
    class="codeblock-nodeview my-4 overflow-hidden rounded-lg"
    :class="`code-theme-${theme}`"
    :data-theme="theme"
    :data-language="language"
    :data-line-numbers="lineNumbers ? 'true' : 'false'"
    :data-wrap="wrapLines ? 'true' : 'false'"
    :data-zoom="zoom"
    :data-collapsed="collapsed ? 'true' : 'false'"
    :data-file-name="fileName"
    :data-show-total-lines="showTotalLines ? 'true' : 'false'"
    data-node-view-wrapper
    :style="{ '--pb-code-zoom': String(zoom) }"
  >
    <div class="codeblock-titlebar" contenteditable="false">
      <div class="codeblock-titlebar-left">
        <button type="button" class="codeblock-ctrl" :title="collapsed ? 'Expand code' : 'Collapse code'" @click="toggleCollapsed">
          <UIcon :name="collapsed ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="size-3" />
        </button>
        <UIcon :name="fileIcon" class="size-3.5 shrink-0" />
        <span v-if="fileName" class="truncate">{{ fileName }}</span>
        <span v-else class="truncate opacity-60">untitled</span>
        <span v-if="showTotalLines" class="opacity-50">·</span>
        <span v-if="showTotalLines" class="opacity-70">{{ lineCount }} {{ lineCount === 1 ? 'line' : 'lines' }}</span>
      </div>
      <div class="codeblock-titlebar-right">
        <button type="button" class="codeblock-ctrl" title="Zoom out" @click="adjustZoom(-0.1)">
          <UIcon name="i-lucide-minus" class="size-3" />
        </button>
        <span class="codeblock-zoom-label">{{ Math.round(zoom * 100) }}%</span>
        <button type="button" class="codeblock-ctrl" title="Zoom in" @click="adjustZoom(0.1)">
          <UIcon name="i-lucide-plus" class="size-3" />
        </button>
        <button
          type="button"
          class="codeblock-ctrl"
          :class="wrapLines ? 'is-active' : ''"
          :aria-pressed="wrapLines ? 'true' : 'false'"
          :title="wrapLines ? 'Wrap: on' : 'Wrap: off'"
          @click="toggleWrap"
        >
          <UIcon name="i-lucide-wrap-text" class="size-3" />
          <span>{{ wrapLines ? 'Wrapped' : 'No wrap' }}</span>
        </button>
        <span class="codeblock-lang-pill">{{ languageLabel }}</span>
      </div>
    </div>
    <div
      ref="bodyWrapEl"
      class="codeblock-body-wrap"
      :class="collapsed && hasOverflow ? 'is-collapsed' : ''"
      :style="bodyWrapStyle"
    >
      <div class="codeblock-body" :class="lineNumbers ? 'has-line-numbers' : ''">
        <div v-if="lineNumbers" class="codeblock-gutter" contenteditable="false" aria-hidden="true">
          <span v-for="n in lineCount" :key="n" class="codeblock-gutter-line">{{ n }}</span>
        </div>
        <pre class="codeblock-pre hljs" :class="wrapLines ? 'is-wrapped' : ''"><NodeViewContent as="code" :class="`language-${language}`" /></pre>
      </div>
      <div v-if="collapsed && hasOverflow" class="codeblock-fade" />
    </div>
    <div v-if="hasOverflow" class="codeblock-tail" contenteditable="false">
      <button type="button" class="codeblock-tail-btn" @click="toggleCollapsed">
        {{ collapsed ? 'Show more' : 'Show less' }}
      </button>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { CODE_BLOCK_LANGUAGES, CODE_BLOCK_THEMES, DEFAULT_CODE_THEME } from '~/extensions/codeBlockEnhanced'

const props = defineProps(nodeViewProps)

const languageLabelMap = new Map<string, string>(CODE_BLOCK_LANGUAGES.map((item) => [item.value as string, item.label]))
const supportedLanguages = new Set<string>(CODE_BLOCK_LANGUAGES.map((item) => item.value as string))
const supportedThemes = new Set<string>(CODE_BLOCK_THEMES.map((item) => item.value as string))

const language = computed(() => {
  const value = typeof props.node.attrs.language === 'string' ? props.node.attrs.language : 'text'
  return supportedLanguages.has(value) ? value : 'text'
})
const theme = computed(() => {
  const value = typeof props.node.attrs.theme === 'string' ? props.node.attrs.theme : DEFAULT_CODE_THEME
  return supportedThemes.has(value) ? value : DEFAULT_CODE_THEME
})
const lineNumbers = computed(() => props.node.attrs.lineNumbers !== false)
const wrapLines = computed(() => props.node.attrs.wrap !== false)
const zoom = computed(() => {
  const value = Number(props.node.attrs.zoom ?? 1)
  return Number.isFinite(value) ? Math.max(0.7, Math.min(2, value)) : 1
})
const collapsed = computed(() => props.node.attrs.collapsed !== false)
const fileName = computed(() => typeof props.node.attrs.fileName === 'string' ? props.node.attrs.fileName : '')
const showTotalLines = computed(() => props.node.attrs.showTotalLines === true)
const languageLabel = computed(() => languageLabelMap.get(language.value) ?? language.value)
const bodyWrapEl = ref<HTMLElement | null>(null)
const hasOverflow = ref(false)

const COLLAPSE_HEIGHT_PX = 256
const bodyWrapStyle = computed(() => {
  if (!collapsed.value || !hasOverflow.value) {
    return {}
  }

  return { maxHeight: `${COLLAPSE_HEIGHT_PX}px` }
})

const lineCount = computed(() => {
  const text = props.node.textContent ?? ''
  const lines = text.split('\n').length
  return Math.max(lines, 1)
})

const fileIcon = computed(() => {
  const ext = (fileName.value.split('.').pop() ?? language.value).toLowerCase()
  const map: Record<string, string> = {
    ts: 'i-vscode-icons-file-type-typescript',
    tsx: 'i-vscode-icons-file-type-typescript',
    js: 'i-vscode-icons-file-type-js',
    jsx: 'i-vscode-icons-file-type-js',
    vue: 'i-vscode-icons-file-type-vue',
    html: 'i-vscode-icons-file-type-html',
    css: 'i-vscode-icons-file-type-css',
    json: 'i-vscode-icons-file-type-json',
    md: 'i-vscode-icons-file-type-markdown',
    markdown: 'i-vscode-icons-file-type-markdown',
    py: 'i-vscode-icons-file-type-python',
    python: 'i-vscode-icons-file-type-python',
    rs: 'i-vscode-icons-file-type-rust',
    rust: 'i-vscode-icons-file-type-rust',
    go: 'i-vscode-icons-file-type-go-gopher'
  }
  return map[ext] ?? 'i-lucide-file-code-2'
})

function adjustZoom(delta: number) {
  const next = Math.max(0.7, Math.min(2, zoom.value + delta))
  props.updateAttributes({ zoom: Math.round(next * 100) / 100 })
}

function toggleWrap() {
  props.updateAttributes({ wrap: !wrapLines.value })
}

function toggleCollapsed() {
  props.updateAttributes({ collapsed: !collapsed.value })
}

function measureOverflow() {
  const body = bodyWrapEl.value
  if (!body) return
  hasOverflow.value = body.scrollHeight > (COLLAPSE_HEIGHT_PX + 1)
}

onMounted(async () => {
  await nextTick()
  measureOverflow()
})

watch([lineCount, wrapLines, zoom], async () => {
  await nextTick()
  measureOverflow()
})
</script>

<style scoped>
.codeblock-body-wrap {
  position: relative;
  overflow: hidden;
}

.codeblock-body-wrap.is-collapsed {
  overflow: hidden;
}

.codeblock-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4.5rem;
  background: linear-gradient(to bottom, transparent, var(--code-bg, #1e1e1e));
  pointer-events: none;
}

.codeblock-nodeview {
  /* Match the public renderer's code metrics for consistent alignment */
  --code-font-size: var(--pb-code-font-size);
  --code-line-height: var(--pb-code-line-height);
  --code-block-padding-y: var(--pb-code-block-padding-y);
  --code-line-number-gutter-width: var(--pb-code-line-number-gutter-width);
  --pb-code-zoom: 1;
  background: var(--code-bg, #1e1e1e);
  color: var(--code-fg, #d4d4d4);
  border: 0;
  box-shadow: none;
}

.codeblock-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.75rem;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  opacity: 0.95;
}

.codeblock-nodeview[data-theme="github-light"] .codeblock-titlebar,
.codeblock-nodeview[data-theme="vs-light"] .codeblock-titlebar,
.codeblock-nodeview[data-theme="solarized-light"] .codeblock-titlebar {
  background: rgba(0, 0, 0, 0.04);
}

.codeblock-titlebar-left {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.4rem;
  font-weight: 500;
}

.codeblock-titlebar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.codeblock-ctrl {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  border: 1px solid rgba(127, 127, 127, 0.28);
  background: transparent;
  color: inherit;
  opacity: 0.85;
  border-radius: 0.3rem;
  padding: 0.1rem 0.35rem;
  font-size: 0.68rem;
  line-height: 1;
}

.codeblock-ctrl:hover {
  opacity: 1;
  border-color: rgba(127, 127, 127, 0.44);
}

.codeblock-ctrl.is-active {
  background: rgba(127, 127, 127, 0.2);
  opacity: 1;
}

.codeblock-zoom-label {
  font-size: 0.68rem;
  opacity: 0.8;
  min-width: 2.2rem;
  text-align: center;
}

.codeblock-lang-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(127, 127, 127, 0.18);
  color: inherit;
  opacity: 0.85;
}

.codeblock-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
  background: transparent;
}

.codeblock-body.has-line-numbers {
  grid-template-columns: auto minmax(0, 1fr);
}

.codeblock-pre,
.codeblock-gutter {
  margin: 0;
  font-size: calc(var(--code-font-size) * var(--pb-code-zoom));
  line-height: calc(var(--code-line-height) * var(--pb-code-zoom));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  padding-top: var(--code-block-padding-y);
  padding-bottom: var(--code-block-padding-y);
}

.codeblock-pre {
  padding-left: 1rem;
  padding-right: 1rem;
  overflow: auto;
  min-width: 0;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.codeblock-pre :deep(code) {
  display: block;
  background: transparent;
  white-space: pre !important;
  font-family: inherit;
  font-size: inherit;
  line-height: var(--code-line-height) !important;
  color: inherit;
  padding: 0;
  margin: 0;
  border: 0 !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.codeblock-pre.is-wrapped :deep(code) {
  white-space: pre-wrap !important;
  overflow-wrap: anywhere;
}

.codeblock-pre :deep(code *) {
  line-height: var(--code-line-height) !important;
}

.codeblock-pre :deep(code:empty::before) {
  content: 'Start typing code...';
  color: rgba(148, 163, 184, 0.75);
  font-style: italic;
  pointer-events: none;
}

.codeblock-gutter {
  display: block;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  color: rgba(127, 127, 127, 0.6);
  user-select: none;
  border-right: 1px solid rgba(127, 127, 127, 0.14);
  min-width: var(--code-line-number-gutter-width);
  background: rgba(0, 0, 0, 0.12);
  text-align: right;
}

.codeblock-nodeview[data-theme="github-light"] .codeblock-gutter,
.codeblock-nodeview[data-theme="vs-light"] .codeblock-gutter,
.codeblock-nodeview[data-theme="solarized-light"] .codeblock-gutter {
  background: rgba(0, 0, 0, 0.03);
  border-right-color: rgba(0, 0, 0, 0.06);
}

.codeblock-gutter-line {
  display: block;
  height: var(--code-line-height);
  line-height: var(--code-line-height);
  font-size: var(--code-font-size);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.codeblock-tail {
  display: flex;
  justify-content: center;
  padding: 0 0 0.5rem;
}

.codeblock-tail-btn {
  border: 0;
  background: transparent;
  color: rgba(230, 237, 243, 0.75);
  font-size: 0.72rem;
  letter-spacing: 0.01em;
  padding: 0.1rem 0.4rem;
  cursor: pointer;
}

.codeblock-tail-btn:hover {
  color: rgba(230, 237, 243, 0.95);
}
</style>
