<template>
  <NodeViewWrapper
    class="columns-block my-4"
    data-type="columns-block"
    :data-columns="columnCount"
    :data-proportions="proportions"
    :data-block-width="blockWidth"
    :style="blockStyle"
  >
    <NodeViewContent class="columns-block-grid" :style="gridStyle" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const columnCount = computed(() => Math.max(2, Math.min(3, props.node.childCount || Number(props.node.attrs.columns ?? 2) || 2)))
const proportions = computed(() => normalizeProportions(String(props.node.attrs.proportions ?? ''), columnCount.value))
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs.blockWidth ?? 'content')))

const gridStyle = computed<CSSProperties>(() => ({
  gridTemplateColumns: proportions.value.split('-').map((part) => `${Math.max(1, Number(part) || 1)}fr`).join(' ')
}))

const blockStyle = computed<CSSProperties>(() => {
  switch (blockWidth.value) {
    case 'wide':
      return {
        width: 'min(120%, 72rem)',
        maxWidth: 'calc(100vw - 2rem)',
        position: 'relative' as const,
        left: '50%',
        transform: 'translateX(-50%)'
      }
    case 'full-bleed':
      return {
        width: '100vw',
        maxWidth: '100vw',
        position: 'relative' as const,
        left: '50%',
        transform: 'translateX(-50%)'
      }
    case 'content':
    default:
      return { width: '100%', maxWidth: '100%' }
  }
})

function normalizeProportions(value: string, count: number) {
  const fallback = count === 3 ? '1-1-1' : '1-1'
  const parts = value.split('-').map((part) => Number(part))
  if (parts.length !== count || parts.some((part) => !Number.isFinite(part) || part <= 0)) {
    return fallback
  }
  return parts.map((part) => Math.max(1, Math.round(part))).join('-')
}

function normalizeBlockWidth(value: string) {
  return value === 'wide' || value === 'full-bleed' ? value : 'content'
}
</script>

<style scoped>
.columns-block {
  margin-block: 1rem;
}

.columns-block-grid {
  display: grid;
  gap: 1rem;
  align-items: stretch;
}

@media (max-width: 760px) {
  .columns-block-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>