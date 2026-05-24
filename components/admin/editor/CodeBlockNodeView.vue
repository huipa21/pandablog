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
      <pre class="hljs"><NodeViewContent as="code" :class="`language-${language}`" /></pre>
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
  --code-line-height: 1.55;
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

pre {
  margin: 0;
  padding: 0.75rem 1rem;
  overflow: auto;
  font-size: 0.875rem;
  line-height: var(--code-line-height);
  min-width: 0;
  background: transparent !important;
}

pre :deep(code) {
  display: block;
  background: transparent;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  color: inherit;
}

pre :deep(code:empty::before) {
  content: 'Start typing code...';
  color: rgba(148, 163, 184, 0.75);
  font-style: italic;
  pointer-events: none;
}

.codeblock-gutter {
  display: block;
  padding: 0.75rem 0.5rem;
  font-size: 0.875rem;
  line-height: var(--code-line-height);
<<<<<<< HEAD
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
=======
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
>>>>>>> copilot/fix-code-block-settings-issues
  color: rgba(127, 127, 127, 0.6);
  user-select: none;
  border-right: 1px solid rgba(127, 127, 127, 0.14);
  min-width: 2.75rem;
  background: rgba(0, 0, 0, 0.12);
}

.codeblock-nodeview[data-theme="github-light"] .codeblock-gutter,
.codeblock-nodeview[data-theme="vs-light"] .codeblock-gutter,
.codeblock-nodeview[data-theme="solarized-light"] .codeblock-gutter {
  background: rgba(0, 0, 0, 0.03);
  border-right-color: rgba(0, 0, 0, 0.06);
}

.codeblock-gutter-line {
  display: block;
<<<<<<< HEAD
  min-height: calc(1em * var(--code-line-height));
=======
>>>>>>> copilot/fix-code-block-settings-issues
  line-height: var(--code-line-height);
  text-align: right;
}
</style>
