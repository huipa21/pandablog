<template>
  <NodeViewWrapper
    ref="nodeViewEl"
    :as="isInline ? 'span' : 'div'"
    :class="[
      isInline ? 'inline-math' : 'block-math',
      'math-nodeview',
      isEditing ? 'is-edit-mode' : 'is-render-mode',
      selected ? 'is-selected' : ''
    ]"
    :data-type="isInline ? 'inline-math' : 'block-math'"
    :data-latex="latex"
    :data-align="!isInline ? align : undefined"
    :data-padding-x="!isInline ? paddingX : undefined"
    :data-padding-y="!isInline ? paddingY : undefined"
    :data-font-size="!isInline ? fontSize : undefined"
    :data-font-family="!isInline ? fontFamily : undefined"
    :style="!isInline ? blockStyle : undefined"
    :title="isInline ? t('admin.editor.nodeViews.inlineFormulaHint') : undefined"
    contenteditable="false"
    data-node-view-wrapper
    @mousedown.stop="selectMathNode"
  >
    <span
      v-if="isInline && !editMode"
      class="inline-math-display"
      :class="{ 'is-empty': !latex.trim() }"
      @click.stop="enterEditMode"
      @dblclick.stop="enterEditMode"
    >
      <span class="math-render" v-html="renderedHtml" />
      <UIcon name="i-lucide-pencil" class="inline-math-click-hint" aria-hidden="true" />
    </span>
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
const blockMode = ref<'source' | 'preview'>('preview')
const { t } = useI18n()

const isInline = computed(() => props.node.type.name === 'inlineMath')
const selected = computed(() => Boolean(props.selected))
const latex = computed(() => typeof props.node.attrs.latex === 'string' ? props.node.attrs.latex : '')
const align = computed(() => normalizeBlockMathAlign(props.node.attrs.align ?? DEFAULT_BLOCK_MATH_ALIGN))
const paddingX = computed(() => normalizeBlockMathPadding(props.node.attrs.paddingX, DEFAULT_BLOCK_MATH_PADDING_X))
const paddingY = computed(() => normalizeBlockMathPadding(props.node.attrs.paddingY, DEFAULT_BLOCK_MATH_PADDING_Y))
const fontSize = computed(() => normalizeBlockMathFontSize(props.node.attrs.fontSize ?? DEFAULT_BLOCK_MATH_FONT_SIZE))
const fontFamily = computed(() => normalizeBlockMathFontFamily(props.node.attrs.fontFamily ?? DEFAULT_BLOCK_MATH_FONT_FAMILY))
const justify = computed(() => align.value === 'left' ? 'flex-start' : align.value === 'right' ? 'flex-end' : 'center')
const isEditing = computed(() => isInline.value ? editMode.value : blockMode.value === 'source')
const blockStyle = computed(() => ({
  '--pb-math-padding-x': `${paddingX.value}px`,
  '--pb-math-padding-y': `${paddingY.value}px`,
  '--pb-math-font-size': String(fontSize.value),
  '--pb-math-source-font-size': `${Math.max(13, Math.round(fontSize.value * 16))}px`,
  '--pb-math-align': align.value,
  '--pb-math-justify': justify.value
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
  if (!isSelected) {
    if (!isInline.value) blockMode.value = 'preview'
    return
  }

  if (!isInline.value || latex.value.trim()) return
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

<style>
@import "katex/dist/katex.min.css";
</style>

<style scoped>
.math-nodeview {
  color: inherit;
}

.inline-math.math-nodeview {
  display: inline-flex;
  align-items: baseline;
  gap: 0.12em;
  padding: 0 0.18em;
  vertical-align: baseline;
  border-bottom: 1px dotted color-mix(in srgb, var(--pb-primary) 48%, transparent);
  border-radius: var(--pb-radius-sm);
  background: color-mix(in srgb, var(--pb-primary) 8%, transparent);
  cursor: pointer;
}

.inline-math.math-nodeview:hover,
.inline-math.math-nodeview.is-selected {
  border-bottom-color: var(--pb-primary);
  background: color-mix(in srgb, var(--pb-primary) 14%, transparent);
}

.block-math.math-nodeview {
  display: block;
  margin: 1rem 0;
  overflow-x: auto;
  cursor: pointer;
  background: var(--pb-surface-subtle);
  color: var(--pb-text);
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

.inline-math-display {
  display: inline-flex;
  align-items: baseline;
  gap: 0.12em;
  min-width: 0;
}

.inline-math-click-hint {
  width: 0.88em;
  height: 0.88em;
  flex: 0 0 auto;
  color: var(--pb-primary);
  opacity: 0.62;
  transform: translateY(0.08em);
}

.inline-math.math-nodeview:hover .inline-math-click-hint,
.inline-math.math-nodeview.is-selected .inline-math-click-hint {
  opacity: 1;
}

.block-math .math-render {
  display: flex;
  justify-content: var(--pb-math-justify, center);
  min-width: 0;
  padding: var(--pb-math-padding-y, 16px) var(--pb-math-padding-x, 16px);
  overflow-x: auto;
  font-family: var(--pb-font-display);
  font-size: calc(1em * var(--pb-math-font-size, 1.15));
  text-align: var(--pb-math-align, center);
}

.math-render :deep(.katex-display) {
  display: inline-block;
  max-width: 100%;
  margin: 0.5rem 0;
  overflow-x: auto;
  overflow-y: hidden;
  text-align: inherit;
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

.block-math[data-font-family='serif'] .math-render :deep(.katex),
.block-math[data-font-family='serif'] .math-render :deep(.katex *),
.block-math[data-font-family='sans'] .math-render :deep(.katex),
.block-math[data-font-family='sans'] .math-render :deep(.katex *),
.block-math[data-font-family='mono'] .math-render :deep(.katex),
.block-math[data-font-family='mono'] .math-render :deep(.katex *) {
  font-family: inherit !important;
}

.math-block-shell {
  display: block;
  overflow: hidden;
  background: var(--pb-surface-subtle);
  color: var(--pb-text);
}

.math-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.75rem;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: color-mix(in srgb, var(--pb-surface) 72%, transparent);
  color: inherit;
  opacity: 0.95;
  border-bottom: 1px solid var(--pb-divider);
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
  color: var(--pb-text);
}

.math-block-body {
  display: block;
  background: var(--pb-surface-subtle);
}

.math-preview-wrap {
  background: var(--pb-surface-subtle);
  color: var(--pb-text);
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
  background: var(--pb-surface-subtle);
  border-radius: var(--pb-radius-card-inner);
  overflow: hidden;
}

.math-source-wrap {
  position: relative;
  display: block;
  background: var(--code-bg, Canvas);
  color: var(--code-fg, CanvasText);
}

.math-source-wrap.is-block-source {
  min-height: calc(var(--pb-math-source-font-size, 16px) * 1.45 + var(--pb-math-padding-y, 16px) * 2);
  background: var(--pb-surface-subtle);
  color: var(--pb-text);
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
  min-height: calc(var(--pb-math-source-font-size, 16px) * 1.45 + var(--pb-math-padding-y, 16px) * 2);
  padding: var(--pb-math-padding-y, 16px) var(--pb-math-padding-x, 16px);
  background: var(--pb-surface-subtle) !important;
  color: var(--pb-text) !important;
  font-size: var(--pb-math-source-font-size, 16px) !important;
  line-height: 1.45 !important;
}

.is-block-source .math-source-highlight :deep(*) {
  color: inherit !important;
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
  min-height: calc(var(--pb-math-source-font-size, 16px) * 1.45 + var(--pb-math-padding-y, 16px) * 2);
  padding: var(--pb-math-padding-y, 16px) var(--pb-math-padding-x, 16px);
  caret-color: var(--pb-text);
  font-size: var(--pb-math-source-font-size, 16px);
  line-height: 1.45;
}

.math-source-input::selection {
  background: rgba(129, 161, 193, 0.35);
}
</style>