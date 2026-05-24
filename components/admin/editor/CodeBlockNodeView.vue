<template>
  <NodeViewWrapper
    class="codeblock-nodeview my-4 overflow-hidden rounded-lg shadow-sm"
    :class="`code-theme-${theme}`"
    :data-theme="theme"
    :data-language="language"
    :data-line-numbers="lineNumbers ? 'true' : 'false'"
    :data-file-name="fileName"
    :data-show-total-lines="showTotalLines ? 'true' : 'false'"
    data-node-view-wrapper
  >
    <div class="codeblock-titlebar" contenteditable="false">
      <div class="codeblock-titlebar-left">
        <UIcon :name="fileIcon" class="size-3.5 shrink-0" />
        <span v-if="fileName" class="truncate">{{ fileName }}</span>
        <span v-else class="truncate opacity-60">untitled</span>
        <span v-if="showTotalLines" class="opacity-50">·</span>
        <span v-if="showTotalLines" class="opacity-70">{{ lineCount }} {{ lineCount === 1 ? 'line' : 'lines' }}</span>
      </div>
      <div class="codeblock-titlebar-right">
        <span class="codeblock-lang-pill">{{ languageLabel }}</span>
      </div>
    </div>
    <div class="codeblock-body" :class="lineNumbers ? 'has-line-numbers' : ''">
      <div v-if="lineNumbers" class="codeblock-gutter" contenteditable="false" aria-hidden="true">
        <span v-for="n in lineCount" :key="n" class="codeblock-gutter-line">{{ n }}</span>
      </div>
      <pre class="codeblock-pre hljs"><NodeViewContent as="code" :class="`language-${language}`" /></pre>
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
const fileName = computed(() => typeof props.node.attrs.fileName === 'string' ? props.node.attrs.fileName : '')
const showTotalLines = computed(() => props.node.attrs.showTotalLines === true)
const languageLabel = computed(() => languageLabelMap.get(language.value) ?? language.value)

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
</script>

<style scoped>
.codeblock-nodeview {
  /* Match the public renderer's code metrics for consistent alignment */
  --code-font-size: 0.8125rem; /* 13px */
  --code-line-height: 1.1875rem; /* 19px */
  --code-block-padding-y: 0.125rem; /* 2px */
  background: var(--code-bg, #1e1e1e);
  color: var(--code-fg, #d4d4d4);
  border: 1px solid rgba(127, 127, 127, 0.18);
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
  border-bottom: 1px solid rgba(127, 127, 127, 0.16);
  color: inherit;
  opacity: 0.95;
}

.codeblock-nodeview[data-theme="github-light"] .codeblock-titlebar,
.codeblock-nodeview[data-theme="vs-light"] .codeblock-titlebar,
.codeblock-nodeview[data-theme="solarized-light"] .codeblock-titlebar {
  background: rgba(0, 0, 0, 0.04);
  border-bottom-color: rgba(0, 0, 0, 0.08);
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
  font-size: var(--code-font-size);
  line-height: var(--code-line-height);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  padding-top: var(--code-block-padding-y);
  padding-bottom: var(--code-block-padding-y);
}

.codeblock-pre {
  margin: 0 !important;
  padding-left: 1rem;
  padding-right: 1rem;
  overflow: auto;
  min-width: 0;
  background: transparent !important;
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
}

.codeblock-pre :deep(code *) {
  font-size: inherit !important;
  font-family: inherit;
  line-height: var(--code-line-height) !important;
}

.codeblock-pre :deep([data-node-view-content]),
.codeblock-pre :deep([data-node-view-content] *) {
  font-size: inherit !important;
  font-family: inherit;
  line-height: var(--code-line-height) !important;
}

.codeblock-pre :deep(code:empty::before) {
  content: 'Start typing code...';
  color: rgba(148, 163, 184, 0.75);
  font-style: italic;
  pointer-events: none;
}

/* Override generic ProseMirror pre styling so gutter and code rows stay aligned. */
.codeblock-nodeview .codeblock-pre {
  margin: 0 !important;
  padding-top: var(--code-block-padding-y) !important;
  padding-bottom: var(--code-block-padding-y) !important;
  padding-left: 1rem !important;
  padding-right: 1rem !important;
  font-size: var(--code-font-size) !important;
  line-height: var(--code-line-height) !important;
}

.codeblock-gutter {
  display: block;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  color: rgba(127, 127, 127, 0.6);
  user-select: none;
  border-right: 1px solid rgba(127, 127, 127, 0.14);
  min-width: 2.75rem;
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
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: var(--code-line-height);
  line-height: var(--code-line-height);
  font-size: var(--code-font-size);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
