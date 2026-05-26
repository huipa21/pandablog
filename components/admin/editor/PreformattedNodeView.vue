<template>
  <NodeViewWrapper
    class="pre-node my-4 overflow-hidden rounded-lg border border-stone-700/40"
    :data-line-numbers="lineNumbers ? 'true' : 'false'"
    data-node-view-wrapper
  >
    <div class="pre-node-header" contenteditable="false">
      <span class="text-xs uppercase tracking-wide opacity-80">Preformatted</span>
      <button type="button" class="pre-copy-btn" :title="copied ? 'Copied!' : 'Copy text'" @click="copyText">
        <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3" />
        <span>{{ copied ? 'Copied' : 'Copy' }}</span>
      </button>
    </div>

    <div class="pre-node-body" :class="lineNumbers ? 'has-line-numbers' : ''" :style="bodyStyle">
      <div v-if="lineNumbers" class="pre-node-gutter" contenteditable="false" aria-hidden="true">
        <span v-for="n in lineCount" :key="n" class="pre-node-gutter-line">{{ n }}</span>
      </div>
      <pre class="pre-node-pre"><NodeViewContent as="code" /></pre>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const textColor = computed(() => String(props.node.attrs.textColor ?? '#e7e5e4'))
const backgroundColor = computed(() => String(props.node.attrs.backgroundColor ?? '#1c1917'))
const fontSize = computed(() => Math.max(10, Number(props.node.attrs.fontSize ?? 14)))
const marginY = computed(() => Math.max(0, Number(props.node.attrs.marginY ?? 12)))
const lineNumbers = computed(() => props.node.attrs.lineNumbers !== false)
const lineCount = computed(() => Math.max((props.node.textContent ?? '').split('\n').length, 1))

const copied = ref(false)

const bodyStyle = computed<CSSProperties>(() => ({
  color: textColor.value,
  backgroundColor: backgroundColor.value,
  fontSize: `${fontSize.value}px`,
  marginTop: `${marginY.value}px`,
  marginBottom: `${marginY.value}px`
}))

async function copyText() {
  try {
    await navigator.clipboard.writeText(props.node.textContent ?? '')
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1400)
  } catch {
    // no-op
  }
}
</script>

<style scoped>
.pre-node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
}

.pre-copy-btn {
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

.pre-copy-btn:hover {
  background: rgba(255, 255, 255, 0.22);
}

.pre-node-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  position: relative;
  z-index: 1;
  border-radius: 0.45rem;
  overflow: hidden;
}

.pre-node-body.has-line-numbers {
  grid-template-columns: auto minmax(0, 1fr);
}

.pre-node-gutter {
  padding: 0.75rem 0.55rem;
  background: rgba(255, 255, 255, 0.1);
  border-right: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.72);
  text-align: right;
  user-select: none;
  font-variant-numeric: tabular-nums;
}

.pre-node-gutter-line {
  display: block;
  line-height: 1.6;
}

.pre-node-pre {
  margin: 0;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  white-space: pre;
  line-height: 1.6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Cascadia Code', monospace;
  background: transparent;
  min-height: 2.25rem;
}

.pre-node-pre :deep(code) {
  display: block;
  white-space: pre;
  font-family: inherit;
  color: inherit;
  background: transparent;
}
</style>
