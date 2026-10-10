<template>
  <div
    class="block-math"
    data-type="block-math"
    :data-latex="latex"
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
  normalizeBlockMathAlign
} from '~/extensions/blockMath'
import { renderLatex } from '~/utils/renderLatex'

const props = defineProps<{
  node: JsonContent
}>()

const latex = computed(() => typeof props.node.attrs?.latex === 'string' ? props.node.attrs.latex : '')
const align = computed(() => normalizeBlockMathAlign(props.node.attrs?.align ?? DEFAULT_BLOCK_MATH_ALIGN))
const paddingX = computed(() => DEFAULT_BLOCK_MATH_PADDING_X)
const paddingY = computed(() => DEFAULT_BLOCK_MATH_PADDING_Y)
const fontSize = computed(() => DEFAULT_BLOCK_MATH_FONT_SIZE)
const fontFamily = computed(() => DEFAULT_BLOCK_MATH_FONT_FAMILY)
const justify = computed(() => align.value === 'left' ? 'flex-start' : align.value === 'right' ? 'flex-end' : 'center')
const blockStyle = computed(() => ({

  '--pb-math-align': align.value,
  '--pb-math-justify': justify.value
}))
const renderedHtml = computed(() => renderLatex(latex.value, { displayMode: true }))
</script>

<style>
@import "katex/dist/katex.min.css";

.block-math {
  display: block;
  margin: 1rem 0;
  overflow-x: auto;
  background: var(--pb-surface-subtle);
  color: var(--pb-text);
  border-radius: var(--pb-radius-card-inner);
}

.block-math .math-render {
  display: flex;
  justify-content: var(--pb-math-justify, center);
  min-width: 0;
  padding: var(--space-lg, 1rem);
  overflow-x: auto;
  font-size: calc(1em * var(--pb-math-font-size, 1.15));
  text-align: var(--pb-math-align, center);
}

.block-math[data-font-family='katex'] .math-render {
  font-family: KaTeX_Main, 'Times New Roman', serif;
}

.block-math .katex-display {
  display: inline-block;
  max-width: 100%;
  margin: 0.5rem 0;
  overflow-x: auto;
  overflow-y: hidden;
  text-align: inherit;
}
</style>