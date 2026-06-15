<template>
  <div
    :class="['block-math', `code-theme-${theme}`]"
    data-type="block-math"
    :data-latex="latex"
    :data-theme="theme"
    :data-align="align"
    :data-padding-x="paddingX"
    :data-padding-y="paddingY"
    :data-font-size="fontSize"
    :data-font-family="fontFamily"
    :style="blockStyle"
  >
    <div class="math-render" v-html="renderedHtml" />
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
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

const props = defineProps<{
  node: JsonContent
}>()

const latex = computed(() => typeof props.node.attrs?.latex === 'string' ? props.node.attrs.latex : '')
const theme = computed(() => typeof props.node.attrs?.theme === 'string' ? props.node.attrs.theme : 'github-dark')
const align = computed(() => normalizeBlockMathAlign(props.node.attrs?.align ?? DEFAULT_BLOCK_MATH_ALIGN))
const paddingX = computed(() => normalizeBlockMathPadding(props.node.attrs?.paddingX, DEFAULT_BLOCK_MATH_PADDING_X))
const paddingY = computed(() => normalizeBlockMathPadding(props.node.attrs?.paddingY, DEFAULT_BLOCK_MATH_PADDING_Y))
const fontSize = computed(() => normalizeBlockMathFontSize(props.node.attrs?.fontSize ?? DEFAULT_BLOCK_MATH_FONT_SIZE))
const fontFamily = computed(() => normalizeBlockMathFontFamily(props.node.attrs?.fontFamily ?? DEFAULT_BLOCK_MATH_FONT_FAMILY))
const blockStyle = computed(() => ({
  '--pb-math-padding-x': `${paddingX.value}px`,
  '--pb-math-padding-y': `${paddingY.value}px`,
  '--pb-math-font-size': String(fontSize.value),
  '--pb-math-align': align.value
}))
const renderedHtml = computed(() => renderLatex(latex.value, { displayMode: true }))
</script>

<style>
.block-math {
  display: block;
  margin: 1rem 0;
  overflow-x: auto;
  background: var(--code-bg, transparent);
  color: var(--code-fg, inherit);
  border-radius: var(--pb-radius-card-inner);
}

.block-math .math-render {
  display: block;
  padding: var(--pb-math-padding-y, 16px) var(--pb-math-padding-x, 16px);
  overflow-x: auto;
  font-size: calc(1em * var(--pb-math-font-size, 1.15));
  text-align: var(--pb-math-align, center);
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

.block-math .katex-display {
  margin: 0.5rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}
</style>