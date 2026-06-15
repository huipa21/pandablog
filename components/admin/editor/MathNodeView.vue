<template>
  <NodeViewWrapper
    ref="nodeViewEl"
    :as="isInline ? 'span' : 'div'"
    :class="[
      isInline ? 'inline-math' : 'block-math',
      'math-nodeview',
      isEditing ? 'is-edit-mode' : 'is-render-mode',
      !isInline ? `code-theme-${theme}` : '',
      selected ? 'is-selected' : ''
    ]"
    :data-type="isInline ? 'inline-math' : 'block-math'"
    :data-latex="latex"
    :data-theme="!isInline ? theme : undefined"
    :data-align="!isInline ? align : undefined"
    :data-padding-x="!isInline ? paddingX : undefined"
    :data-padding-y="!isInline ? paddingY : undefined"
    :data-font-size="!isInline ? fontSize : undefined"
    :data-font-family="!isInline ? fontFamily : undefined"
    :style="!isInline ? blockStyle : undefined"
    contenteditable="false"
    data-node-view-wrapper
    @mousedown.stop="selectMathNode"
  >
    <span
      v-if="isInline && !editMode"
      class="math-render"
      :class="{ 'is-empty': !latex.trim() }"
      @click.stop="enterEditMode"
      @dblclick.stop="enterEditMode"
      v-html="renderedHtml"
    />
    <div
      v-else-if="!isInline"
      class="math-block-shell"
      @mousedown.stop="selectMathNode"
    >
      <div class="math-block-header">
        <div class="math-block-header-left">
          <UIcon name="i-lucide-sigma" class="size-3.5 shrink-0" />
          <span class="truncate">formula.tex</span>
          <span v-if="validationMessage" class="math-block-validation" :class="validationError ? 'is-error' : 'is-ok'">
            {{ validationMessage }}
          </span>
        </div>
        <div class="math-block-header-right">
          <span class="math-block-lang-pill">LaTeX</span>
          <div class="math-block-tabs" role="tablist" :aria-label="t('admin.editor.nodeViews.formulaMode')">
            <button
              type="button"
              class="math-block-tab"
              :class="blockMode === 'source' ? 'is-active' : ''"
              role="tab"
              :aria-selected="blockMode === 'source' ? 'true' : 'false'"
              @click="setBlockMode('source')"
            >{{ t('admin.editor.nodeViews.source') }}</button>
            <button
              type="button"
              class="math-block-tab"
              :class="blockMode === 'preview' ? 'is-active' : ''"
              role="tab"
              :aria-selected="blockMode === 'preview' ? 'true' : 'false'"
              @click="setBlockMode('preview')"
            >{{ t('admin.editor.nodeViews.preview') }}</button>
          </div>
        </div>
      </div>
      <div class="math-block-body" :class="`mode-${blockMode}`">
        <div v-if="blockMode === 'source'" class="math-source-wrap is-block-source">
          <pre
            ref="highlightEl"
            class="math-source-highlight hljs"
            aria-hidden="true"
          ><code class="language-latex" v-html="highlightedHtml" /></pre>
          <textarea
            ref="sourceInputEl"
            class="math-source-input"
            spellcheck="false"
            rows="5"
            :value="latex"
            placeholder="E = mc^2"
            @input="onSourceInput"
            @scroll="syncSourceScroll"
            @keydown.stop
          />
        </div>
        <div v-else class="math-preview-wrap">
          <div
            class="math-render"
            :class="{ 'is-empty': !latex.trim(), 'has-error': Boolean(validationError) }"
            v-html="renderedHtml"
          />
        </div>
      </div>
    </div>
    <span
      v-else
      class="math-source-panel code-theme-nord"
      data-theme="nord"
      data-language="latex"
      @mousedown.stop
    >
      <span class="math-source-wrap is-inline-source">
        <code
          ref="highlightEl"
          class="math-source-highlight hljs language-latex"
          aria-hidden="true"
          v-html="highlightedHtml"
        />
        <textarea
          ref="sourceInputEl"
          class="math-source-input"
          spellcheck="false"
          rows="1"
          :value="latex"
          placeholder="LaTeX"
          @input="onSourceInput"
          @blur="onSourceBlur"
          @scroll="syncSourceScroll"
          @keydown.stop
        />
      </span>
    </span>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { NodeSelection } from '@tiptap/pm/state'
import latexLanguage from 'highlight.js/lib/languages/latex'
import { createLowlight } from 'lowlight'
import katex from 'katex'
import { CODE_BLOCK_THEMES, DEFAULT_CODE_THEME } from '~/extensions/codeBlockEnhanced'
import {
  DEFAULT_BLOCK_MATH_ALIGN,
  DEFAULT_BLOCK_MATH_FONT_FAMILY,
  DEFAULT_BLOCK_MATH_FONT_SIZE,
  DEFAULT_BLOCK_MATH_PADDING_X,
  DEFAULT_BLOCK_MATH_PADDING_Y,
  normalizeBlockMathAlign,
  normalizeBlockMathFontFamily,
  normalizeBlockMathFontSize,
  normalizeBlockMathPadding
} from '~/extensions/blockMath'
import { renderLatex } from '~/utils/renderLatex'

type HighlightNode = {
  type?: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HighlightNode[]
}

const props = defineProps(nodeViewProps)
const lowlight = createLowlight()
lowlight.register('latex', latexLanguage)

const nodeViewEl = ref<HTMLElement | null>(null)
const sourceInputEl = ref<HTMLTextAreaElement | null>(null)
const highlightEl = ref<HTMLElement | null>(null)
const editMode = ref(false)
const blockMode = ref<'source' | 'preview'>('source')
const { t } = useI18n()

const isInline = computed(() => props.node.type.name === 'inlineMath')
const selected = computed(() => Boolean(props.selected))
const latex = computed(() => typeof props.node.attrs.latex === 'string' ? props.node.attrs.latex : '')
const supportedThemes = new Set<string>(CODE_BLOCK_THEMES.map((item) => item.value as string))
const theme = computed(() => {
  const raw = typeof props.node.attrs.theme === 'string' ? props.node.attrs.theme : DEFAULT_CODE_THEME
  return supportedThemes.has(raw) ? raw : DEFAULT_CODE_THEME
})
const align = computed(() => normalizeBlockMathAlign(props.node.attrs.align ?? DEFAULT_BLOCK_MATH_ALIGN))
const paddingX = computed(() => normalizeBlockMathPadding(props.node.attrs.paddingX, DEFAULT_BLOCK_MATH_PADDING_X))
const paddingY = computed(() => normalizeBlockMathPadding(props.node.attrs.paddingY, DEFAULT_BLOCK_MATH_PADDING_Y))
const fontSize = computed(() => normalizeBlockMathFontSize(props.node.attrs.fontSize ?? DEFAULT_BLOCK_MATH_FONT_SIZE))
const fontFamily = computed(() => normalizeBlockMathFontFamily(props.node.attrs.fontFamily ?? DEFAULT_BLOCK_MATH_FONT_FAMILY))
const isEditing = computed(() => isInline.value ? editMode.value : blockMode.value === 'source')
const blockStyle = computed(() => ({
  '--pb-math-padding-x': `${paddingX.value}px`,
  '--pb-math-padding-y': `${paddingY.value}px`,
  '--pb-math-font-size': String(fontSize.value),
  '--pb-math-align': align.value
}))
const sourceText = computed(() => latex.value || ' ')
const renderedHtml = computed(() => {
  if (!latex.value.trim()) {
    return '<span class="math-placeholder">LaTeX</span>'
  }

  return renderLatex(latex.value, { displayMode: !isInline.value })
})
const validationError = computed(() => validateLatex(latex.value, !isInline.value))
const validationMessage = computed(() => {
  if (!latex.value.trim()) return t('admin.editor.nodeViews.formulaEmpty')
  return validationError.value ? validationError.value : t('admin.editor.nodeViews.formulaValid')
})
const highlightedHtml = computed(() => {
  try {
    const tree = lowlight.highlight('latex', sourceText.value)
    return renderNodes(tree.children as HighlightNode[])
  } catch {
    return renderPlainText(sourceText.value)
  }
})

watch(selected, async (isSelected) => {
  if (!isSelected || !isInline.value || latex.value.trim()) return
  await enterEditMode()
})

async function enterEditMode() {
  if (!props.editor.isEditable) return
  selectMathNode()
  editMode.value = true
  await nextTick()
  sourceInputEl.value?.focus()
  sourceInputEl.value?.select()
}

function onSourceInput(event: Event) {
  props.updateAttributes({ latex: (event.target as HTMLTextAreaElement).value })
}

function onSourceBlur() {
  if (!isInline.value) return
  editMode.value = false
}

async function setBlockMode(mode: 'source' | 'preview') {
  blockMode.value = mode
  if (mode !== 'source') return

  await nextTick()
  sourceInputEl.value?.focus()
}

function selectMathNode() {
  const pos = props.getPos?.()
  const editor = props.editor
  if (typeof pos !== 'number' || !editor) return

  const node = editor.state.doc.nodeAt(pos)
  if (!node || (node.type.name !== 'inlineMath' && node.type.name !== 'blockMath')) return

  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
}

function syncSourceScroll(event: Event) {
  const source = event.target as HTMLTextAreaElement
  const highlighter = highlightEl.value
  if (!highlighter) return

  highlighter.scrollTop = source.scrollTop
  highlighter.scrollLeft = source.scrollLeft
}

function renderNodes(nodes: HighlightNode[] = []): string {
  return nodes.map((node) => renderNode(node)).join('')
}

function renderNode(node: HighlightNode): string {
  if (!node) return ''

  if (node.type === 'text') {
    return escapeHtml(node.value ?? '')
  }

  if (node.type === 'element' && node.tagName) {
    const classNames = Array.isArray(node.properties?.className)
      ? (node.properties?.className as string[]).filter(Boolean).join(' ')
      : ''
    const classAttr = classNames ? ` class="${escapeHtml(classNames)}"` : ''
    return `<${node.tagName}${classAttr}>${renderNodes(node.children ?? [])}</${node.tagName}>`
  }

  return renderNodes(node.children ?? [])
}

function renderPlainText(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br>')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function validateLatex(value: string, displayMode: boolean) {
  if (!value.trim()) return ''

  try {
    katex.renderToString(value, {
      displayMode,
      throwOnError: true,
      strict: false,
      output: 'htmlAndMathml'
    })
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : t('admin.editor.nodeViews.formulaInvalid')
  }
}
</script>

<style scoped>
.math-nodeview {
  color: inherit;
}

.inline-math.math-nodeview {
  display: inline;
  cursor: pointer;
}

.block-math.math-nodeview {
  display: block;
  margin: 1rem 0;
  overflow-x: auto;
  cursor: pointer;
  background: var(--code-bg, Canvas);
  color: var(--code-fg, CanvasText);
  border-radius: var(--pb-radius-card-inner);
}

.math-nodeview.is-selected.is-render-mode {
  outline: 2px solid color-mix(in srgb, var(--pb-primary) 42%, transparent);
  outline-offset: 3px;
  border-radius: var(--pb-radius-sm);
}

.math-render {
  color: inherit;
}

.inline-math .math-render {
  display: inline;
}

.block-math .math-render {
  display: block;
  padding: var(--pb-math-padding-y, 16px) var(--pb-math-padding-x, 16px);
  overflow-x: auto;
  font-family: var(--pb-font-display);
  font-size: calc(1em * var(--pb-math-font-size, 1.15));
  text-align: var(--pb-math-align, center);
}

.math-render :deep(.katex-display) {
  margin: 0.5rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.math-render.is-empty {
  display: inline-flex;
  align-items: center;
  min-height: 1.85em;
  color: var(--pb-text-placeholder);
  font-family: var(--pb-font-text);
  font-size: 0.9em;
}

.block-math .math-render.is-empty {
  display: flex;
  min-height: 3.5rem;
  justify-content: center;
  border: 1px dashed var(--pb-divider-strong);
  border-radius: var(--pb-radius-card-inner);
  background: color-mix(in srgb, var(--pb-surface-subtle) 75%, transparent);
}

.block-math .math-render.has-error {
  text-align: left;
}

.block-math[data-font-family='katex'] .math-render {
  font-family: KaTeX_Main, 'Times New Roman', serif;
}

.block-math[data-font-family='serif'] .math-render {
  font-family: Georgia, 'Times New Roman', serif;
}

.block-math[data-font-family='sans'] .math-render {
  font-family: var(--pb-font-text);
}

.block-math[data-font-family='mono'] .math-render {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
}

.math-block-shell {
  display: block;
  overflow: hidden;
  background: var(--code-bg, Canvas);
  color: var(--code-fg, CanvasText);
}

.math-block-header {
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
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
}

.block-math[data-theme='github-light'] .math-block-header,
.block-math[data-theme='vs-light'] .math-block-header,
.block-math[data-theme='solarized-light'] .math-block-header {
  background: rgba(0, 0, 0, 0.04);
}

.math-block-header-left,
.math-block-header-right {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.45rem;
}

.math-block-header-right {
  flex-shrink: 0;
}

.math-block-validation {
  display: inline-flex;
  min-width: 0;
  max-width: 16rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.82;
}

.math-block-validation.is-error {
  color: var(--pb-math-error);
}

.math-block-validation.is-ok {
  color: inherit;
  opacity: 0.58;
}

.math-block-lang-pill {
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

.math-block-tabs {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border-radius: 0.35rem;
  border: 1px solid rgba(127, 127, 127, 0.28);
}

.math-block-tab {
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  opacity: 0.82;
  padding: 0.18rem 0.6rem;
  font-size: 0.75rem;
  line-height: 1.2;
}

.math-block-tab:hover {
  background: rgba(127, 127, 127, 0.2);
  opacity: 1;
}

.math-block-tab.is-active {
  background: rgba(127, 127, 127, 0.25);
  opacity: 1;
  color: var(--code-fg, CanvasText);
}

.math-block-body {
  display: block;
  min-height: 9rem;
  background: var(--code-bg, Canvas);
}

.math-preview-wrap {
  background: var(--code-bg, var(--pb-card-bg));
  color: var(--code-fg, var(--pb-text));
}

.math-source-panel {
  color: var(--code-fg, CanvasText);
}

.inline-math .math-source-panel {
  display: inline-block;
  min-width: min(18rem, 90vw);
  max-width: 100%;
  vertical-align: baseline;
}

.block-math .math-source-panel {
  display: block;
  background: var(--code-bg, Canvas);
  border-radius: var(--pb-radius-card-inner);
  overflow: hidden;
}

.math-source-wrap {
  position: relative;
  display: block;
  background: var(--code-bg, Canvas);
  color: var(--code-fg, CanvasText);
}

.math-source-wrap.is-inline-source {
  display: inline-block;
  min-width: 12rem;
  max-width: 100%;
  min-height: 2.1rem;
  border-radius: var(--pb-radius-card-inner);
  overflow: hidden;
  vertical-align: middle;
}

.math-source-highlight {
  display: block;
  min-height: 2.1rem;
  margin: 0;
  padding: 0.45rem 0.65rem;
  overflow: auto;
  background: var(--code-bg, Canvas) !important;
  color: var(--code-fg, CanvasText);
  border: 0 !important;
  box-shadow: none !important;
  outline: 0 !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  font-size: var(--pb-code-font-size);
  line-height: var(--pb-code-line-height);
  white-space: pre;
  pointer-events: none;
}

.is-block-source .math-source-highlight {
  min-height: 8rem;
  padding: var(--pb-code-block-padding-y) 1rem;
}

.math-source-highlight :deep(code) {
  display: block;
  min-height: inherit;
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  color: inherit !important;
  border: 0 !important;
  box-shadow: none !important;
  font-family: inherit;
}

.math-source-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 2.1rem;
  margin: 0;
  padding: 0.45rem 0.65rem;
  border: 0;
  background: transparent;
  resize: none;
  overflow: auto;
  outline: none;
  color: transparent;
  caret-color: var(--code-fg, CanvasText);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  font-size: var(--pb-code-font-size);
  line-height: var(--pb-code-line-height);
  white-space: pre;
}

.is-block-source .math-source-input {
  min-height: 8rem;
  padding: var(--pb-code-block-padding-y) 1rem;
}

.math-source-input::selection {
  background: rgba(129, 161, 193, 0.35);
}
</style>