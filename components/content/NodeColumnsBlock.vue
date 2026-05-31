<template>
  <div
    class="columns-block my-4"
    data-type="columns-block"
    :data-columns="columnCount"
    :data-proportions="proportions"
    :data-block-width="blockWidth"
    :style="blockStyle"
  >
    <div class="columns-block-grid" :style="gridStyle">
      <div
        v-for="(column, index) in columns"
        :key="index"
        class="columns-block-column"
        data-type="column-item"
        :data-header="columnHeader(column) || undefined"
      >
        <div v-if="columnHeader(column)" class="columns-block-header">{{ columnHeader(column) }}</div>
        <div class="columns-block-content">
          <ContentRenderer v-for="(child, childIndex) in column.content ?? []" :key="childIndex" :node="child" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { JsonContent } from '~/types/content'
import ContentRenderer from './ContentRenderer.vue'

const props = defineProps<{
  node: JsonContent
}>()

const columns = computed(() => (props.node.content ?? []).filter((child) => child.type === 'columnItem'))
const columnCount = computed(() => Math.max(2, Math.min(3, columns.value.length || Number(props.node.attrs?.columns ?? 2) || 2)))
const proportions = computed(() => normalizeProportions(String(props.node.attrs?.proportions ?? ''), columnCount.value))
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs?.blockWidth ?? 'content')))

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

function columnHeader(column: JsonContent) {
  return String(column.attrs?.header ?? '').trim()
}

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

.columns-block-column {
  min-width: 0;
  border: 1px solid rgb(231 229 228);
  border-radius: 0.5rem;
  background: rgb(255 255 255);
  overflow: hidden;
}

.columns-block-header {
  border-bottom: 1px solid rgb(231 229 228);
  background: rgb(250 250 249);
  color: rgb(28 25 23);
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.35;
  padding: 0.65rem 0.85rem;
}

.columns-block-content {
  min-width: 0;
  padding: 0.85rem;
}

.columns-block-content :deep(> :first-child) {
  margin-top: 0;
}

.columns-block-content :deep(> :last-child) {
  margin-bottom: 0;
}

@media (max-width: 760px) {
  .columns-block-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>