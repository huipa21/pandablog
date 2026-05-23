<template>
  <div class="mermaid-block my-6 overflow-hidden rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
    <ClientOnly>
      <div v-if="error" class="text-xs text-rose-700">
        <p class="mb-2 font-medium">Mermaid render error:</p>
        <pre class="overflow-x-auto whitespace-pre-wrap rounded bg-rose-50 p-3">{{ error }}</pre>
        <details class="mt-2">
          <summary class="cursor-pointer">Show source</summary>
          <pre class="mt-1 overflow-x-auto rounded bg-stone-100 p-3 text-stone-700"><code>{{ code }}</code></pre>
        </details>
      </div>
      <div v-else ref="container" class="mermaid-diagram overflow-x-auto text-center" />
      <template #fallback>
        <pre class="overflow-x-auto rounded bg-stone-100 p-4 text-sm text-stone-700"><code>{{ code }}</code></pre>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { JsonContent } from '~/types/content'

type MermaidModule = (typeof import('mermaid'))['default']

let mermaidPromise: Promise<MermaidModule> | null = null
let mermaidInitialized = false
const diagramCache = new Map<string, string>()

const props = defineProps<{
  node: JsonContent
}>()

const container = ref<HTMLElement | null>(null)
const error = ref('')
const code = computed(() => typeof props.node.attrs?.code === 'string' ? props.node.attrs.code : '')

onMounted(() => {
  void renderDiagram()
})

watch(code, () => {
  void renderDiagram()
})

async function renderDiagram() {
  if (!code.value.trim()) {
    error.value = ''
    return
  }

  const cached = diagramCache.get(code.value)
  if (cached) {
    await nextTick()
    if (container.value) container.value.innerHTML = cached
    error.value = ''
    return
  }

  try {
    const mermaid = await loadMermaid()
    const id = `mermaid-${Math.random().toString(36).slice(2)}`
    const { svg } = await mermaid.render(id, code.value)
    diagramCache.set(code.value, svg)
    await nextTick()
    if (container.value) container.value.innerHTML = svg
    error.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error'
  }
}

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => module.default)
  }

  const mermaid = await mermaidPromise
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'default'
    })
    mermaidInitialized = true
  }

  return mermaid
}
</script>

<style scoped>
.mermaid-diagram :deep(svg) {
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
</style>