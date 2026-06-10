<template>
  <NodeViewWrapper
    class="columns-block"
    data-type="columns-block"
    :data-columns="columnCount"
    :data-proportions="proportions"
    :data-show-headers="showHeaders ? 'true' : 'false'"
    :data-layout-mode="layoutMode"
    :data-block-width="blockWidth"
    :style="blockStyle"
    @keydown.delete="handleKeyboardDelete"
    @keydown.backspace="handleKeyboardDelete"
  >
    <div class="columns-block-shell">
      <NodeViewContent class="columns-block-grid" :style="gridStyle" />

      <div class="columns-block-overlays" contenteditable="false">
        <button
          v-for="(handle, index) in resizeHandles"
          :key="`handle-${index}`"
          type="button"
          class="columns-block-resize-handle"
          :style="{ left: `${handle}%` }"
          :aria-label="t('admin.editor.nodeViews.resizeColumns', { left: index + 1, right: index + 2 })"
          @mousedown.prevent.stop
          @pointerdown="startResize($event, index)"
        />
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { NodeSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)

const { t } = useI18n()
const columnCount = computed(() => Math.max(2, Math.min(6, props.node.childCount || Number(props.node.attrs.columns ?? 2) || 2)))
const proportions = computed(() => normalizeProportions(String(props.node.attrs.proportions ?? ''), columnCount.value))
const customPercentages = computed(() => parseCustomPercentages(String(props.node.attrs.customPercentages ?? ''), columnCount.value))
const showHeaders = computed(() => props.node.attrs.showHeaders !== false)
const layoutMode = computed(() => (customPercentages.value.length ? 'manual' : 'preset'))
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs.blockWidth ?? 'content')))
const columnGap = computed(() => String(props.node.attrs.columnGap ?? '1rem'))
const marginTop = computed(() => String(props.node.attrs.marginTop ?? '1rem'))
const marginBottom = computed(() => String(props.node.attrs.marginBottom ?? '1rem'))

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

const resizeHandles = computed(() => {
  const handles: number[] = []
  let cumulative = 0
  for (let i = 0; i < activePercentages.value.length - 1; i += 1) {
    cumulative += activePercentages.value[i] ?? 0
    handles.push(cumulative)
  }
  return handles
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

function serializePercentages(values: number[]) {
  return normalizePercentages(values)
    .map((value) => value.toFixed(2).replace(/\.00$/, ''))
    .join(',')
}

function startResize(event: PointerEvent, boundaryIndex: number) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()

  const handleEl = event.currentTarget as HTMLElement | null
  const shell = handleEl?.closest('.columns-block-shell') as HTMLElement | null
  const width = shell?.getBoundingClientRect().width ?? 0
  if (width <= 0) return

  try {
    handleEl?.setPointerCapture(event.pointerId)
  } catch {
    // setPointerCapture can throw in rare cases; ignore.
  }

  const startX = event.clientX
  const start = [...activePercentages.value]
  const minWidth = 10

  const handleMove = (moveEvent: PointerEvent) => {
    const deltaPercent = ((moveEvent.clientX - startX) / width) * 100
    const leftStart = start[boundaryIndex] ?? 0
    const rightStart = start[boundaryIndex + 1] ?? 0
    const pairTotal = leftStart + rightStart
    const nextLeft = Math.max(minWidth, Math.min(pairTotal - minWidth, leftStart + deltaPercent))
    const nextRight = pairTotal - nextLeft

    const next = [...start]
    next[boundaryIndex] = nextLeft
    next[boundaryIndex + 1] = nextRight
    props.updateAttributes({ customPercentages: serializePercentages(next) })
  }

  const handleUp = (upEvent: PointerEvent) => {
    try {
      handleEl?.releasePointerCapture(upEvent.pointerId)
    } catch {
      // ignore
    }
    handleEl?.removeEventListener('pointermove', handleMove)
    handleEl?.removeEventListener('pointerup', handleUp)
    handleEl?.removeEventListener('pointercancel', handleUp)
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
  }

  handleEl?.addEventListener('pointermove', handleMove)
  handleEl?.addEventListener('pointerup', handleUp)
  handleEl?.addEventListener('pointercancel', handleUp)
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp)
}

function handleKeyboardDelete(event: KeyboardEvent) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') {
    return
  }

  const selection = props.editor.state.selection
  if (!(selection instanceof NodeSelection)) {
    return
  }

  const getPos = props.getPos as (() => number) | number | undefined
  const nodePos = typeof getPos === 'function' ? getPos() : typeof getPos === 'number' ? getPos : null
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

.columns-block-shell {
  position: relative;
  max-width: 100%;
}

.columns-block-grid {
  display: grid;
  gap: 1rem;
  align-items: stretch;
}

.columns-block-overlays {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.columns-block-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 5;
  width: 18px;
  transform: translateX(-50%);
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
  pointer-events: auto;
}

.columns-block-resize-handle::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0.4rem;
  bottom: 0.4rem;
  width: 3px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgb(15 118 110 / 35%);
  transition: background-color 120ms ease, width 120ms ease;
}

.columns-block-resize-handle:hover::before,
.columns-block-resize-handle:focus-visible::before,
.columns-block-resize-handle:active::before {
  background: rgb(13 148 136 / 90%);
  width: 4px;
}

@media (max-width: 760px) {
  .columns-block-grid {
    grid-template-columns: 1fr !important;
  }

  .columns-block-overlays {
    display: none;
  }
}
</style>
