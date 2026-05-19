<template>
  <div class="my-6 overflow-hidden rounded-lg border border-stone-800 bg-stone-950">
    <div v-if="language" class="border-b border-stone-800 px-4 py-2 text-xs font-medium uppercase tracking-wider text-stone-400">
      {{ language }}
    </div>
    <ClientOnly>
      <div class="overflow-x-auto text-sm" v-html="highlightedHtml || fallbackHtml" />
      <template #fallback>
        <div class="overflow-x-auto text-sm" v-html="fallbackHtml" />
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'

type ShikiModule = typeof import('shiki')

let shikiPromise: Promise<ShikiModule> | null = null
const htmlCache = new Map<string, string>()

const props = defineProps<{
  node: JsonContent
}>()

const code = computed(() => textContent(props.node))
const language = computed(() => typeof props.node.attrs?.language === 'string' ? props.node.attrs.language : 'text')
const highlightedHtml = ref('')
const fallbackHtml = computed(() => `<pre><code>${escapeHtml(code.value)}</code></pre>`)

async function renderCode() {
  const cacheKey = `${language.value}\u0000${code.value}`
  const cached = htmlCache.get(cacheKey)
  if (cached) {
    highlightedHtml.value = cached
    return
  }

  const shiki = await loadShiki()
  const lang = language.value in shiki.bundledLanguages ? language.value : 'text'
  const rendered = await shiki.codeToHtml(code.value, {
    lang,
    theme: 'github-dark-default'
  }).catch(() => fallbackHtml.value)

  htmlCache.set(cacheKey, rendered)
  highlightedHtml.value = rendered
}

onMounted(() => {
  void renderCode()
})

watch([code, language], () => {
  void renderCode()
})

function loadShiki() {
  if (!shikiPromise) {
    shikiPromise = import('shiki')
  }
  return shikiPromise
}

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