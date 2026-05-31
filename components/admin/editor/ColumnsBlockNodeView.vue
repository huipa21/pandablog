<template>
  <NodeViewWrapper
    class="columns-block"
    data-type="columns-block"
    :data-columns="columnCount"
    :data-proportions="proportions"
    :data-block-width="blockWidth"
    :style="blockStyle"
    @keydown.delete="handleKeyboardDelete"
    @keydown.backspace="handleKeyboardDelete"
  >
    <NodeViewContent class="columns-block-grid" :style="gridStyle" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { NodeSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const columnCount = computed(() => Math.max(2, Math.min(6, props.node.childCount || Number(props.node.attrs.columns ?? 2) || 2)))
const proportions = computed(() => normalizeProportions(String(props.node.attrs.proportions ?? ''), columnCount.value))
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs.blockWidth ?? 'content')))
const customPercentages = computed(() => {
  const fromAttrs = parseCustomPercentages(String(props.node.attrs.customPercentages ?? ''), columnCount.value)
  if (fromAttrs.length) {
    return fromAttrs
  }
  return deriveCustomPercentagesFromColumns(props.node, columnCount.value)
})
const columnGap = computed(() => String(props.node.attrs.columnGap ?? '1rem'))
const marginTop = computed(() => String(props.node.attrs.marginTop ?? '1rem'))
const marginBottom = computed(() => String(props.node.attrs.marginBottom ?? '1rem'))

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

function normalizeProportions(value: string, count: number) {
  const fallback = evenProportions(count)
  const parts = value.split('-').map((part) => Number(part))
  if (parts.length !== count || parts.some((part) => !Number.isFinite(part) || part <= 0)) {
    return fallback
  }
  return parts.map((part) => Math.max(1, Math.round(part))).join('-')
}

function normalizeBlockWidth(value: string) {
  return value === 'wide' || value === 'full-bleed' ? value : 'content'
}

function evenProportions(count: number) {
  return Array.from({ length: Math.max(2, Math.min(6, count)) }, () => '1').join('-')
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

function deriveCustomPercentagesFromColumns(node: typeof props.node, count: number): number[] {
  const widths = Array.from({ length: count }, (_unused, index) => {
    const child = index < node.childCount ? node.child(index) : null
    if (!child || child.type.name !== 'columnItem') return 0
    const value = Number(child.attrs.widthPercent ?? 0)
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

function handleKeyboardDelete(event: KeyboardEvent) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') {
    return
  }

  const selection = props.editor.state.selection
  if (!(selection instanceof NodeSelection)) {
    return
  }

  const pos = props.getPos()
  const nodePos = typeof pos === 'function' ? pos() : typeof pos === 'number' ? pos : null
  if (typeof nodePos !== 'number') {
    return
  }

  if (selection.from === nodePos && selection.node.type.name === 'columnsBlock') {
    event.preventDefault()
  }
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
