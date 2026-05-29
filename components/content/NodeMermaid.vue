<template>
  <div class="mermaid-nodeview my-4 overflow-hidden rounded-lg border border-stone-300 bg-white">
    <div class="mermaid-body mode-preview">
      <div class="mermaid-preview-pane">
        <ClientOnly>
          <div v-if="error" class="mermaid-error">{{ error }}</div>
          <div v-else ref="container" class="mermaid-preview mermaid-diagram" />
          <template #fallback>
            <pre class="mermaid-textarea"><code>{{ code }}</code></pre>
          </template>
        </ClientOnly>
      </div>
    </div>
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
.mermaid-body {
  display: grid;
  gap: 1px;
  background: rgb(231 229 228);
  min-height: 12rem;
}

.mermaid-body.mode-preview {
  grid-template-columns: 1fr;
}

.mermaid-preview-pane {
  padding: 0.75rem;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
}

.mermaid-preview {
  width: 100%;
  text-align: center;
}

.mermaid-preview :deep(svg),
.mermaid-diagram :deep(svg) {
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.mermaid-error {
  color: rgb(190 18 60);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  white-space: pre-wrap;
  padding: 0.5rem;
  background: rgb(254 226 226);
  border-radius: 0.375rem;
  width: 100%;
}

.mermaid-textarea {
  width: 100%;
  min-height: 12rem;
  padding: 0.75rem 1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  background: transparent;
  color: rgb(41 37 36);
}
</style>