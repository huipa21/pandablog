<template>
  <NodeViewWrapper
    class="accordion-block"
    data-type="accordion-block"
    :data-accordion-view-id="viewId"
    :data-single-open="singleOpen ? 'true' : 'false'"
    :data-start-collapsed="startCollapsed ? 'true' : 'false'"
    :data-columns="columns"
    :data-pane-style="paneStyle"
    :data-trigger-icon="triggerIcon"
    :data-block-width="blockWidth"
    :style="blockStyle"
    @accordion-pane-toggle="onPaneToggle"
  >
    <NodeViewContent class="accordion-block-grid" :style="gridStyle" />
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)
const viewId = `accordion-block-${Math.random().toString(36).slice(2)}`

const singleOpen = computed(() => props.node.attrs.singleOpen !== false)
const startCollapsed = computed(() => props.node.attrs.startCollapsed === true)
const columns = computed(() => normalizeColumns(props.node.attrs.columns))
const paneStyle = computed(() => normalizePaneStyle(String(props.node.attrs.paneStyle ?? 'minimal')))
const triggerIcon = computed(() => normalizeTriggerIcon(String(props.node.attrs.triggerIcon ?? 'chevron')))
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs.blockWidth ?? 'content')))
const marginTop = computed(() => String(props.node.attrs.marginTop ?? '1rem'))
const marginBottom = computed(() => String(props.node.attrs.marginBottom ?? '1rem'))
const paneCount = computed(() => {
  let count = 0
  props.node.forEach((child) => {
    if (child.type.name === 'accordionPane') count += 1
  })
  return Math.max(1, count)
})
const defaultOpenIndices = computed(() => normalizeDefaultOpenIndices(props.node.attrs.defaultOpenIndices, paneCount.value, singleOpen.value, startCollapsed.value))
const defaultOpenKey = computed(() => defaultOpenIndices.value.join(','))
const openIndices = ref(new Set(defaultOpenIndices.value))

const blockStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {
    marginTop: marginTop.value,
    marginBottom: marginBottom.value
  }

  switch (blockWidth.value) {
    case 'wide':
      return {
        ...style,
        width: 'min(120%, 72rem)',
        maxWidth: 'calc(100vw - 2rem)',
        position: 'relative' as const,
        left: '50%',
        transform: 'translateX(-50%)'
      }
    case 'full-bleed':
      // In the editor, break out to the full 3-column editor grid (gutter+content+gutter)
      // rather than 100vw, which overflows past the admin sidebar chrome.
      return {
        ...style,
        width: 'calc(100% + 2 * (var(--pb-editor-gutter, 32px) + var(--pb-editor-gap, 8px)))',
        maxWidth: 'calc(100% + 2 * (var(--pb-editor-gutter, 32px) + var(--pb-editor-gap, 8px)))',
        position: 'relative' as const,
        left: '50%',
        transform: 'translateX(-50%)'
      }
    case 'content':
    default:
      return { ...style, width: '100%', maxWidth: '100%' }
  }
})
const gridStyle = computed(() => ({ '--accordion-cols': String(columns.value) } as CSSProperties))

watch([defaultOpenKey, paneCount, singleOpen, startCollapsed], () => {
  openIndices.value = new Set(defaultOpenIndices.value)
  nextTick(refreshPaneState)
}, { immediate: true })
onMounted(() => nextTick(refreshPaneState))
onUpdated(() => nextTick(refreshPaneState))

function onPaneToggle(event: Event) {
  const paneId = (event as CustomEvent<{ paneId?: string }>).detail?.paneId
  if (!paneId) return

  const index = paneIndexForId(paneId)
  if (index < 0) return

  const next = new Set(openIndices.value)
  if (next.has(index)) {
    next.delete(index)
  } else if (singleOpen.value) {
    next.clear()
    next.add(index)
  } else {
    next.add(index)
  }
  openIndices.value = next
  selectThisBlock()
  nextTick(refreshPaneState)
}

function paneIndexForId(paneId: string) {
  return paneElements().findIndex((pane) => pane.dataset.accordionPaneId === paneId)
}

function paneElements() {
  const root = document.querySelector<HTMLElement>(`[data-accordion-view-id="${viewId}"]`)
  return Array.from(root?.querySelectorAll<HTMLElement>(':scope > .accordion-block-grid > .accordion-pane') ?? [])
}

function refreshPaneState() {
  paneElements().forEach((pane, index) => {
    const open = openIndices.value.has(index)
    const button = pane.querySelector<HTMLButtonElement>(':scope > .accordion-pane-header')
    const content = pane.querySelector<HTMLElement>(':scope > .accordion-pane-content')
    const headerId = `${viewId}-header-${index}`
    const panelId = `${viewId}-panel-${index}`

    pane.dataset.index = String(index)
    pane.dataset.open = open ? 'true' : 'false'
    button?.setAttribute('id', headerId)
    button?.setAttribute('aria-expanded', open ? 'true' : 'false')
    button?.setAttribute('aria-controls', panelId)
    content?.setAttribute('id', panelId)
    content?.setAttribute('role', 'region')
    content?.setAttribute('aria-labelledby', headerId)
    if (content) content.hidden = !open
  })
}

function selectThisBlock() {
  const getPos = props.getPos as (() => number) | number | undefined
  const nodePos = typeof getPos === 'function' ? getPos() : typeof getPos === 'number' ? getPos : null
  if (typeof nodePos !== 'number') return
  props.editor.chain().focus().setNodeSelection(nodePos).run()
}

function normalizeColumns(value: unknown) {
  const columns = Number(value)
  return Math.max(1, Math.min(3, Number.isFinite(columns) ? Math.round(columns) : 1))
}

function normalizePaneStyle(value: string) {
  return ['dark', 'colored', 'underline', 'highlighted'].includes(value) ? value : 'minimal'
}

function normalizeTriggerIcon(value: string) {
  return ['plus-minus', 'arrow'].includes(value) ? value : 'chevron'
}

function normalizeBlockWidth(value: string) {
  return value === 'wide' || value === 'full-bleed' ? value : 'content'
}

function normalizeDefaultOpenIndices(value: unknown, count: number, single: boolean, collapsed: boolean) {
  if (collapsed) return []
  const values = Array.isArray(value) ? value : String(value ?? '').split(',')
  const indices = Array.from(new Set(values.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item < count))).sort((left, right) => left - right)
  return single ? indices.slice(0, 1) : indices
}
</script>

<style>
.accordion-block {
  display: block;
}

.accordion-block-grid {
  display: grid;
  grid-template-columns: repeat(var(--accordion-cols, 1), minmax(0, 1fr));
  gap: 0.65rem;
}

.accordion-pane {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--pb-divider);
  border-radius: var(--pb-radius-card-inner);
  background: var(--pb-card-bg);
}

.accordion-pane-header {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 0;
  background: var(--pb-surface-subtle);
  color: var(--pb-text);
  cursor: pointer;
  font-weight: 650;
  line-height: 1.25;
  padding: 0.8rem 0.9rem;
  text-align: left;
}

.accordion-pane-title {
  min-width: 0;
  flex: 1;
}

.accordion-pane-title-input {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
  padding: 0;
}

.accordion-pane-trigger {
  display: inline-flex;
  height: 1.1rem;
  width: 1.1rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.accordion-pane-icon {
  display: none;
  height: 1.1rem;
  width: 1.1rem;
  transition: transform 0.16s ease;
}

.accordion-pane-plus-minus {
  display: none;
  font-weight: 750;
  line-height: 1;
}

.accordion-block[data-trigger-icon="chevron"] .accordion-pane-icon.is-chevron,
.accordion-block[data-trigger-icon="arrow"] .accordion-pane-icon.is-arrow,
.accordion-block[data-trigger-icon="plus-minus"] .accordion-pane-plus-minus.is-plus {
  display: inline-block;
}

.accordion-block[data-trigger-icon="plus-minus"] .accordion-pane[data-open="true"] .accordion-pane-plus-minus.is-plus {
  display: none;
}

.accordion-block[data-trigger-icon="plus-minus"] .accordion-pane[data-open="true"] .accordion-pane-plus-minus.is-minus {
  display: inline-block;
}

.accordion-pane[data-open="true"] .accordion-pane-trigger.is-chevron svg {
  transform: rotate(180deg);
}

.accordion-pane[data-open="true"] .accordion-pane-icon.is-chevron {
  transform: rotate(180deg);
}

.accordion-pane-content {
  min-width: 0;
  padding: 0.95rem;
}

.accordion-pane-content[hidden] {
  display: none;
}

.accordion-pane-content > :first-child {
  margin-top: 0;
}

.accordion-pane-content > :last-child {
  margin-bottom: 0;
}

.accordion-block[data-pane-style="dark"] .accordion-pane-header {
  background: var(--pb-text);
  color: var(--pb-card-bg);
}

.accordion-block[data-pane-style="colored"] .accordion-pane {
  border-color: var(--pb-selected-border);
}

.accordion-block[data-pane-style="colored"] .accordion-pane-header {
  background: var(--pb-selected-bg);
  color: var(--pb-link);
}

.accordion-block[data-pane-style="underline"] .accordion-pane {
  border-color: transparent;
  border-radius: 0;
  border-bottom-color: var(--pb-divider);
}

.accordion-block[data-pane-style="underline"] .accordion-pane-header {
  border-bottom: 2px solid var(--pb-selected-border);
  background: transparent;
  padding-inline: 0;
}

.accordion-block[data-pane-style="highlighted"] .accordion-pane {
  border-color: var(--pb-selected-border);
  background: var(--pb-selected-bg);
}

.accordion-block[data-pane-style="highlighted"] .accordion-pane-header {
  background: transparent;
  color: var(--pb-link);
}

.accordion-block[data-trigger-icon="arrow"] .accordion-pane-icon.is-arrow {
  transform: none;
}

@media (max-width: 760px) {
  .accordion-block-grid {
    grid-template-columns: 1fr;
  }
}
</style>