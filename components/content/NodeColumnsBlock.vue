<template>
  <div
    class="columns-block"
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
        :data-header-alignment="getHeaderAlignment(column)"
      >
        <div v-if="columnHeader(column)" class="columns-block-header" :class="`header-align-${getHeaderAlignment(column)}`">{{ columnHeader(column) }}</div>
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
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs?.blockWidth ?? 'content')))
const customPercentages = computed(() => {
  const fromAttrs = parseCustomPercentages(String(props.node.attrs?.customPercentages ?? ''), columnCount.value)
  if (fromAttrs.length) {
    return fromAttrs
  }
  return deriveCustomPercentagesFromColumns(columns.value, columnCount.value)
})
const columnGap = computed(() => String(props.node.attrs?.columnGap ?? '1rem'))
const marginTop = computed(() => String(props.node.attrs?.marginTop ?? '1rem'))
const marginBottom = computed(() => String(props.node.attrs?.marginBottom ?? '1rem'))

const gridStyle = computed<CSSProperties>(() => {
  const templateColumns = customPercentages.value.length > 0
    ? customPercentages.value.map((p) => `${p}%`).join(' ')
    : proportions.value.split('-').map((part) => `${Math.max(1, Number(part) || 1)}fr`).join(' ')

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

function getHeaderAlignment(column: JsonContent) {
  const value = String(column.attrs?.headerAlignment ?? 'left')
  return value === 'center' || value === 'right' ? value : 'left'
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

function normalizeBlockWidth(value: string) {
  return value === 'wide' || value === 'full-bleed' ? value : 'content'
}

function parseCustomPercentages(value: string, count: number): number[] {
  if (!value.trim()) return []
  const parts = value.split(',').map((p) => Number(p.trim()))
  if (parts.length !== count || parts.some((p) => !Number.isFinite(p) || p <= 0 || p > 100)) {
    return []
  }
  const total = parts.reduce((sum, p) => sum + p, 0)
  if (Math.abs(total - 100) > 0.01) {
    return []
  }
  return parts
}

function deriveCustomPercentagesFromColumns(columnNodes: JsonContent[], count: number): number[] {
  const widths = Array.from({ length: count }, (_unused, index) => {
    const column = columnNodes[index]
    const value = Number(column?.attrs?.widthPercent ?? 0)
    return Number.isFinite(value) && value > 0 ? Math.min(100, Math.max(1, value)) : 0
  })

  if (widths.every((value) => value <= 0)) {
    return []
  }

  const specifiedTotal = widths.reduce((sum, value) => sum + (value > 0 ? value : 0), 0)
  const missingCount = widths.filter((value) => value <= 0).length

  if (missingCount === 0) {
    if (specifiedTotal <= 0) return []
    const scale = 100 / specifiedTotal
    return widths.map((value) => roundPercent(value * scale))
  }

  const remaining = 100 - specifiedTotal
  if (remaining <= 0) {
    return []
  }

  const auto = remaining / missingCount
  return widths.map((value) => roundPercent(value > 0 ? value : auto))
}

function roundPercent(value: number) {
  return Math.round(value * 10000) / 10000
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

.columns-block-header.header-align-center {
  text-align: center;
}

.columns-block-header.header-align-right {
  text-align: right;
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
