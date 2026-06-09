<template>
  <div
    class="accordion-block"
    data-type="accordion-block"
    :data-single-open="singleOpen ? 'true' : 'false'"
    :data-start-collapsed="startCollapsed ? 'true' : 'false'"
    :data-columns="columns"
    :data-pane-style="paneStyle"
    :data-trigger-icon="triggerIcon"
    :data-block-width="blockWidth"
    :style="blockStyle"
  >
    <div class="accordion-block-grid" :style="gridStyle">
      <div
        v-for="(panel, index) in panels"
        :key="index"
        class="accordion-pane"
        data-type="accordion-pane"
        :data-title="panelTitle(panel, index)"
        :data-default-open="defaultOpenIndices.includes(index) ? 'true' : 'false'"
        :data-open="isOpen(index) ? 'true' : 'false'"
      >
        <button
          :id="headerId(index)"
          class="accordion-pane-header"
          type="button"
          :aria-expanded="isOpen(index) ? 'true' : 'false'"
          :aria-controls="panelId(index)"
          @click="togglePane(index)"
        >
          <span class="accordion-pane-title">{{ panelTitle(panel, index) }}</span>
          <span class="accordion-pane-trigger" :class="triggerIcon === 'chevron' ? 'is-chevron' : ''" aria-hidden="true">
            <span v-if="triggerIcon === 'plus-minus'" class="accordion-pane-plus-minus">{{ isOpen(index) ? '-' : '+' }}</span>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path :d="triggerIcon === 'arrow' ? 'M5 12h14m-6-6 6 6-6 6' : 'm6 9 6 6 6-6'" />
            </svg>
          </span>
        </button>
        <div
          v-show="isOpen(index)"
          :id="panelId(index)"
          class="accordion-pane-content"
          role="region"
          :aria-labelledby="headerId(index)"
        >
          <ContentRenderer v-for="(child, childIndex) in panel.content ?? []" :key="childIndex" :node="child" />
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

const viewId = `accordion-public-${Math.random().toString(36).slice(2)}`
const panels = computed(() => (props.node.content ?? []).filter((child) => child.type === 'accordionPane'))
const singleOpen = computed(() => props.node.attrs?.singleOpen !== false)
const startCollapsed = computed(() => props.node.attrs?.startCollapsed === true)
const columns = computed(() => normalizeColumns(props.node.attrs?.columns))
const paneStyle = computed(() => normalizePaneStyle(String(props.node.attrs?.paneStyle ?? 'minimal')))
const triggerIcon = computed(() => normalizeTriggerIcon(String(props.node.attrs?.triggerIcon ?? 'chevron')))
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs?.blockWidth ?? 'content')))
const marginTop = computed(() => String(props.node.attrs?.marginTop ?? '1rem'))
const marginBottom = computed(() => String(props.node.attrs?.marginBottom ?? '1rem'))
const defaultOpenIndices = computed(() => normalizeDefaultOpenIndices(props.node.attrs?.defaultOpenIndices, panels.value.length, singleOpen.value, startCollapsed.value, panels.value))
const defaultOpenKey = computed(() => defaultOpenIndices.value.join(','))
const openIndices = ref(new Set(defaultOpenIndices.value))

watch([defaultOpenKey, panels, singleOpen, startCollapsed], () => {
  openIndices.value = new Set(defaultOpenIndices.value)
})

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
      return {
        ...style,
        width: '100vw',
        maxWidth: '100vw',
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

function togglePane(index: number) {
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
}

function isOpen(index: number) {
  return openIndices.value.has(index)
}

function panelTitle(panel: JsonContent, index: number) {
  return String(panel.attrs?.title ?? `Accordion Pane ${index + 1}`).trim() || `Accordion Pane ${index + 1}`
}

function headerId(index: number) {
  return `${viewId}-header-${index}`
}

function panelId(index: number) {
  return `${viewId}-panel-${index}`
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

function normalizeDefaultOpenIndices(value: unknown, count: number, single: boolean, collapsed: boolean, panelList: JsonContent[]) {
  if (collapsed) return []
  const values = Array.isArray(value) ? value : String(value ?? '').split(',')
  const parsed = values.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item < count)
  const childDefaults = panelList.map((panel, index) => panel.attrs?.defaultOpen === true ? index : -1).filter((index) => index >= 0)
  const indices = Array.from(new Set(parsed.length ? parsed : childDefaults)).sort((left, right) => left - right)
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

.accordion-pane-trigger {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.accordion-pane-trigger svg {
  height: 1.1rem;
  width: 1.1rem;
  transition: transform 0.16s ease;
}

.accordion-pane[data-open="true"] .accordion-pane-trigger.is-chevron svg {
  transform: rotate(180deg);
}

.accordion-pane-content {
  min-width: 0;
  padding: 0.95rem;
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

.accordion-block[data-trigger-icon="plus-minus"] .accordion-pane-trigger svg,
.accordion-block[data-trigger-icon="arrow"] .accordion-pane-trigger.is-chevron svg {
  transform: none;
}

@media (max-width: 760px) {
  .accordion-block-grid {
    grid-template-columns: 1fr;
  }
}
</style>