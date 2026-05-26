<template>
  <div class="pre-public-wrap overflow-hidden rounded-lg border border-stone-700/40">
    <div class="pre-public-header">
      <span class="text-xs uppercase tracking-wide opacity-80">Preformatted</span>
      <button type="button" class="pre-public-copy" :title="copied ? 'Copied!' : 'Copy text'" @click="copyText">
        <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3" />
        <span>{{ copied ? 'Copied' : 'Copy' }}</span>
      </button>
    </div>

    <div class="pre-public-body" :class="lineNumbers ? 'has-line-numbers' : ''" :style="bodyStyle">
      <div v-if="lineNumbers" class="pre-public-gutter" aria-hidden="true">
        <span v-for="n in lineCount" :key="n" class="pre-public-gutter-line">{{ n }}</span>
      </div>
      <pre class="pre-public-pre"><code>{{ text }}</code></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { JsonContent } from '~/types/content'

const props = defineProps<{
  node: JsonContent
}>()

const copied = ref(false)

const text = computed(() => flattenNodeText(props.node))
const lineCount = computed(() => Math.max(text.value.split('\n').length, 1))
const lineNumbers = computed(() => props.node.attrs?.lineNumbers !== false)

const bodyStyle = computed<CSSProperties>(() => ({
  color: String(props.node.attrs?.textColor ?? '#e7e5e4'),
  backgroundColor: String(props.node.attrs?.backgroundColor ?? '#1c1917'),
  fontSize: `${Math.max(10, Number(props.node.attrs?.fontSize ?? 14))}px`,
  marginTop: `${Math.max(0, Number(props.node.attrs?.marginY ?? 12))}px`,
  marginBottom: `${Math.max(0, Number(props.node.attrs?.marginY ?? 12))}px`
}))

async function copyText() {
  try {
    await navigator.clipboard.writeText(text.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1400)
  } catch {
    // no-op
  }
}

function flattenNodeText(node: JsonContent): string {
  if (node.type === 'text') return node.text ?? ''
  return node.content?.map(flattenNodeText).join('') ?? ''
}
</script>

<style scoped>
.pre-public-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
}

.pre-public-copy {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 0;
  border-radius: 0.35rem;
  background: rgba(255, 255, 255, 0.14);
  color: inherit;
  padding: 0.15rem 0.45rem;
  font-size: 11px;
  cursor: pointer;
}

.pre-public-copy:hover {
  background: rgba(255, 255, 255, 0.22);
}

.pre-public-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  border-radius: 0.45rem;
  overflow: hidden;
}

.pre-public-body.has-line-numbers {
  grid-template-columns: auto minmax(0, 1fr);
}

.pre-public-gutter {
  padding: 0.75rem 0.55rem;
  background: rgba(255, 255, 255, 0.1);
  border-right: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.72);
  text-align: right;
  user-select: none;
  font-variant-numeric: tabular-nums;
}

.pre-public-gutter-line {
  display: block;
  line-height: 1.6;
}

.pre-public-pre {
  margin: 0;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  white-space: pre;
  line-height: 1.6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  background: transparent;
  min-height: 2.25rem;
}

.pre-public-pre code {
  white-space: pre;
  font-family: inherit;
  color: inherit;
  background: transparent;
}
</style>
