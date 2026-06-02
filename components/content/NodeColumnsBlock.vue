<template>
  <div
    class="columns-block"
    data-type="columns-block"
    :data-columns="columnCount"
    :data-proportions="proportions"
    :data-show-headers="showHeaders ? 'true' : 'false'"
    :data-layout-mode="layoutMode"
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
        :data-width-percent="formatPercent(activePercentages[index] ?? 0)"
      >
        <div v-if="showHeaders && columnHeader(column)" class="columns-block-header">{{ columnHeader(column) }}</div>
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
const columnCount = computed(() => Math.max(2, Math.min(6, columns.value.length || Number(props.node.attrs?.columns ?? 2) || 2)))
const proportions = computed(() => normalizeProportions(String(props.node.attrs?.proportions ?? ''), columnCount.value))
const customPercentages = computed(() => parseCustomPercentages(String(props.node.attrs?.customPercentages ?? ''), columnCount.value))
const showHeaders = computed(() => props.node.attrs?.showHeaders !== false)
const layoutMode = computed(() => (customPercentages.value.length ? 'manual' : 'preset'))
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs?.blockWidth ?? 'content')))
const columnGap = computed(() => String(props.node.attrs?.columnGap ?? '1rem'))
const marginTop = computed(() => String(props.node.attrs?.marginTop ?? '1rem'))
const marginBottom = computed(() => String(props.node.attrs?.marginBottom ?? '1rem'))

const activePercentages = computed(() => {
  if (customPercentages.value.length === columnCount.value) {
    return customPercentages.value
  }
  return proportionsToPercentages(proportions.value, columnCount.value)
})

const gridStyle = computed<CSSProperties>(() => {
  const templateColumns = activePercentages.value.map((value) => `${value}fr`).join(' ')

  return {
    gridTemplateColumns: templateColumns,
    gap: columnGap.value
  }
})

const blockStyle = computed<CSSProperties>(() => {
  const spacing = {
    marginTop: marginTop.value,
    marginBottom: marginBottom.value
  }

  switch (blockWidth.value) {
    case 'wide':
      return {
        width: 'min(120%, 72rem)',
        maxWidth: 'calc(100vw - 2rem)',
        position: 'relative' as const,
        left: '50%',
        transform: 'translateX(-50%)',
        ...spacing
      }
    case 'full-bleed':
      return {
        width: '100vw',
        maxWidth: '100vw',
        position: 'relative' as const,
        left: '50%',
        transform: 'translateX(-50%)',
        ...spacing
      }
    case 'content':
    default:
      return {
        width: '100%',
        maxWidth: '100%',
        ...spacing
      }
  }
})

function columnHeader(column: JsonContent) {
  return String(column.attrs?.header ?? '').trim()
}

function normalizeProportions(value: string, count: number) {
  const fallback = evenProportions(count)
  const parts = value.split('-').map((part) => Number(part))
  if (parts.length !== count || parts.some((part) => !Number.isFinite(part) || part <= 0)) {
    return fallback
  }
  return parts.map((part) => Math.max(1, Math.round(part))).join('-')
}

function evenProportions(count: number) {
  return Array.from({ length: Math.max(2, Math.min(6, count)) }, () => '1').join('-')
}

function parseCustomPercentages(value: string, count: number): number[] {
  if (!value.trim()) return []
  const parts = value.split(',').map((part) => Number(part.trim()))
  if (parts.length !== count || parts.some((part) => !Number.isFinite(part) || part <= 0 || part >= 100)) {
    return []
  }

  const total = parts.reduce((sum, part) => sum + part, 0)
  if (Math.abs(total - 100) > 0.1) {
    return []
  }

  return normalizePercentages(parts)
}

function proportionsToPercentages(value: string, count: number): number[] {
  const normalized = normalizeProportions(value, count)
  const weights = normalized.split('-').map((part) => Math.max(1, Number(part) || 1))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  if (!totalWeight) {
    return normalizePercentages(Array.from({ length: count }, () => 100 / count))
  }
  return normalizePercentages(weights.map((weight) => (weight / totalWeight) * 100))
}

function normalizePercentages(values: number[]): number[] {
  if (!values.length) return []
  const rounded = values.map((value) => Math.max(1, Math.min(99, Math.round(value * 100) / 100)))
  const total = rounded.reduce((sum, value) => sum + value, 0)
  const adjustment = Math.round((100 - total) * 100) / 100
  const lastIndex = rounded.length - 1
  const lastValue = rounded[lastIndex] ?? 0
  rounded[lastIndex] = Math.round((lastValue + adjustment) * 100) / 100
  return rounded
}

function formatPercent(value: number) {
  return `${Math.round(value * 10) / 10}%`
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
  position: relative;
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
