<template>
  <div class="my-6 overflow-hidden rounded-lg border border-stone-800 bg-stone-950">
    <div v-if="language" class="border-b border-stone-800 px-4 py-2 text-xs font-medium uppercase tracking-wider text-stone-400">
      {{ language }}
    </div>
    <div class="overflow-x-auto text-sm" v-html="highlightedHtml" />
  </div>
</template>

<script setup lang="ts">
import { bundledLanguages, codeToHtml } from 'shiki'
import type { JsonContent } from '~/types/content'

const props = defineProps<{
  node: JsonContent
}>()

const code = computed(() => textContent(props.node))
const language = computed(() => typeof props.node.attrs?.language === 'string' ? props.node.attrs.language : 'text')
const highlightedHtml = ref('')

async function renderCode() {
  const lang = language.value in bundledLanguages ? language.value : 'text'

  highlightedHtml.value = await codeToHtml(code.value, {
    lang,
    theme: 'github-dark-default'
  }).catch(() => `<pre><code>${escapeHtml(code.value)}</code></pre>`)
}

await renderCode()
watch([code, language], () => {
  void renderCode()
})

function textContent(node: JsonContent): string {
  if (node.type === 'text') {
    return node.text ?? ''
  }

  return node.content?.map(textContent).join('') ?? ''
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
</script>