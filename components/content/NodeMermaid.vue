<template>
  <div class="my-6 overflow-hidden rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
    <ClientOnly>
      <div ref="container" class="mermaid-diagram overflow-x-auto" />
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
const code = computed(() => typeof props.node.attrs?.code === 'string' ? props.node.attrs.code : '')

onMounted(() => {
  void renderDiagram()
})

watch(code, () => {
  void renderDiagram()
})

async function renderDiagram() {
  if (!container.value || !code.value.trim()) {
    return
  }

  const cached = diagramCache.get(code.value)
  if (cached) {
    container.value.innerHTML = cached
    return
  }

  try {
    const mermaid = await loadMermaid()
    const id = `mermaid-${Math.random().toString(36).slice(2)}`
    const { svg } = await mermaid.render(id, code.value)
    diagramCache.set(code.value, svg)
    container.value.innerHTML = svg
  } catch {
    container.value.innerHTML = `<pre><code>${escapeHtml(code.value)}</code></pre>`
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
      securityLevel: 'strict',
      theme: 'neutral'
    })
    mermaidInitialized = true
  }

  return mermaid
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
</script>