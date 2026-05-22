<template>
  <NodeViewWrapper
    class="codeblock-nodeview my-4 overflow-hidden rounded-lg border border-stone-800"
    :class="`code-theme-${theme}`"
    :data-theme="theme"
    :data-language="language"
    :data-line-numbers="lineNumbers ? 'true' : 'false'"
    :data-file-name="fileName"
    :data-show-total-lines="showTotalLines ? 'true' : 'false'"
    data-node-view-wrapper
  >
    <div class="flex items-center justify-between gap-2 border-b border-stone-700/60 bg-stone-900 px-3 py-1.5 text-xs" contenteditable="false">
      <div class="flex min-w-0 items-center gap-2 text-stone-400">
        <UIcon name="i-lucide-file-code-2" class="size-3.5 shrink-0" />
        <span v-if="fileName" class="truncate text-stone-300">{{ fileName }}</span>
        <span v-else class="truncate text-stone-400">Code snippet</span>
        <span class="text-stone-500">·</span>
        <span class="uppercase tracking-wide">{{ languageLabel }}</span>
      </div>
      <div v-if="showTotalLines" class="shrink-0 text-stone-400">
        {{ lineCount }} {{ lineCount === 1 ? 'line' : 'lines' }}
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
import { CODE_BLOCK_LANGUAGES, DEFAULT_CODE_THEME } from '~/extensions/codeBlockEnhanced'

const props = defineProps(nodeViewProps)

const languageLabelMap = new Map<string, string>(CODE_BLOCK_LANGUAGES.map((item) => [item.value as string, item.label]))

const language = computed(() => typeof props.node.attrs.language === 'string' ? props.node.attrs.language : 'text')
const theme = computed(() => typeof props.node.attrs.theme === 'string' ? props.node.attrs.theme : DEFAULT_CODE_THEME)
const lineNumbers = computed(() => props.node.attrs.lineNumbers !== false)
const fileName = computed(() => typeof props.node.attrs.fileName === 'string' ? props.node.attrs.fileName : '')
const showTotalLines = computed(() => props.node.attrs.showTotalLines === true)
const languageLabel = computed(() => languageLabelMap.get(language.value) ?? language.value)

const lineCount = computed(() => {
  const text = props.node.textContent ?? ''
  const lines = text.split('\n').length
  return Math.max(lines, 1)
})
</script>

<style scoped>
.codeblock-body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: stretch;
}

pre {
  margin: 0;
  padding: 0.75rem 1rem;
  overflow: auto;
  font-size: 0.875rem;
  line-height: 1.6;
  min-width: 0;
}

pre :deep(code) {
  display: block;
  background: transparent;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.codeblock-gutter {
  display: block;
  align-items: flex-end;
  padding: 0.75rem 0.5rem;
  font-size: 0.875rem;
  line-height: 1.6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: rgba(148, 163, 184, 0.55);
  user-select: none;
  border-right: 1px solid rgba(148, 163, 184, 0.18);
  min-width: 3rem;
  background: rgba(0, 0, 0, 0.18);
}

.codeblock-gutter-line {
  display: block;
  text-align: right;
}
</style>
