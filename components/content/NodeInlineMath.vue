<template>
  <span class="inline-math" data-type="inline-math" :data-latex="latex"><span class="math-render" v-html="renderedHtml" /></span>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import { renderLatex } from '~/utils/renderLatex'

const props = defineProps<{
  node: JsonContent
}>()

const latex = computed(() => typeof props.node.attrs?.latex === 'string' ? props.node.attrs.latex : '')
const renderedHtml = computed(() => renderLatex(latex.value, { displayMode: false }))
</script>

<style>
.inline-math {
  display: inline;
  color: inherit;
}

.inline-math .math-render {
  display: inline;
}

.inline-math .katex {
  font-size: 1em;
}
</style>