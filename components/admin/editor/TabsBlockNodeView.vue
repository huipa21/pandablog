<template>
  <NodeViewWrapper
    class="tabs-block my-4"
    data-type="tabs-block"
    :data-tabs-view-id="viewId"
    :data-orientation="orientation"
    :data-tab-style="tabStyle"
    :data-active-index="activeIndex"
    :data-block-width="blockWidth"
    :style="blockStyle"
  >
    <div class="tabs-block-shell">
      <div class="tabs-block-list" role="tablist" contenteditable="false" :aria-orientation="orientation">
        <button
          v-for="(tab, index) in tabs"
          :key="`${tab.title}-${index}`"
          type="button"
          class="tabs-block-tab"
          :class="{ 'is-active': index === activeIndex }"
          role="tab"
          :aria-selected="index === activeIndex"
          @mousedown.prevent="setActiveIndex(index)"
        >
          {{ tab.title }}
        </button>
      </div>
      <NodeViewContent class="tabs-block-panels" />
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)
const viewId = `tabs-block-${Math.random().toString(36).slice(2)}`

const orientation = computed(() => normalizeOrientation(String(props.node.attrs.orientation ?? 'horizontal')))
const tabStyle = computed(() => normalizeTabStyle(String(props.node.attrs.tabStyle ?? 'underline')))
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs.blockWidth ?? 'content')))
const tabs = computed(() => {
  const items: Array<{ title: string }> = []
  props.node.forEach((child) => {
    items.push({ title: String(child.attrs.title ?? `Tab ${items.length + 1}`).trim() || `Tab ${items.length + 1}` })
  })
  return items
})
const activeIndex = computed(() => {
  const maxIndex = Math.max(0, tabs.value.length - 1)
  const value = Number(props.node.attrs.activeIndex ?? 0)
  return Number.isFinite(value) ? Math.max(0, Math.min(maxIndex, Math.round(value))) : 0
})

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

watch([activeIndex, tabs], () => nextTick(refreshPanelState), { immediate: true })
onMounted(() => nextTick(refreshPanelState))
onUpdated(() => nextTick(refreshPanelState))

function setActiveIndex(index: number) {
  props.updateAttributes({ activeIndex: index })
}

function refreshPanelState() {
  const root = document.querySelector<HTMLElement>(`[data-tabs-view-id="${viewId}"]`)
  const panels = root?.querySelectorAll<HTMLElement>(':scope .tabs-block-panels > .tabs-block-panel') ?? []
  panels.forEach((panel, index) => {
    const active = index === activeIndex.value
    panel.dataset.active = active ? 'true' : 'false'
    panel.hidden = !active
  })
}

function normalizeOrientation(value: string) {
  return value === 'vertical' ? 'vertical' : 'horizontal'
}

function normalizeTabStyle(value: string) {
  return value === 'pills' || value === 'enclosed' ? value : 'underline'
}

function normalizeBlockWidth(value: string) {
  return value === 'wide' || value === 'full-bleed' ? value : 'content'
}
</script>

<style scoped>
.tabs-block {
  margin-block: 1rem;
}

.tabs-block-shell {
  display: grid;
  gap: 0.85rem;
}

.tabs-block[data-orientation="vertical"] .tabs-block-shell {
  grid-template-columns: minmax(10rem, 0.28fr) minmax(0, 1fr);
  align-items: start;
}

.tabs-block-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  border-bottom: 1px solid rgb(231 229 228);
}

.tabs-block[data-orientation="vertical"] .tabs-block-list {
  flex-direction: column;
  border-right: 1px solid rgb(231 229 228);
  border-bottom: 0;
  padding-right: 0.75rem;
}

.tabs-block-tab {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: rgb(87 83 78);
  cursor: pointer;
  font-size: 0.92rem;
  font-weight: 650;
  line-height: 1.2;
  padding: 0.65rem 0.75rem;
  text-align: left;
}

.tabs-block-tab.is-active {
  border-bottom-color: rgb(15 118 110);
  color: rgb(15 118 110);
}

.tabs-block[data-tab-style="pills"] .tabs-block-list,
.tabs-block[data-tab-style="enclosed"] .tabs-block-list {
  border-bottom: 0;
}

.tabs-block[data-tab-style="pills"] .tabs-block-tab {
  border: 1px solid transparent;
  border-radius: 999px;
}

.tabs-block[data-tab-style="pills"] .tabs-block-tab.is-active {
  border-color: rgb(153 246 228);
  background: rgb(240 253 250);
}

.tabs-block[data-tab-style="enclosed"] .tabs-block-tab {
  border: 1px solid rgb(231 229 228);
  border-radius: 0.45rem 0.45rem 0 0;
  background: rgb(250 250 249);
}

.tabs-block[data-tab-style="enclosed"] .tabs-block-tab.is-active {
  background: rgb(255 255 255);
  border-color: rgb(153 246 228);
}

.tabs-block-panels {
  min-width: 0;
}

@media (max-width: 760px) {
  .tabs-block[data-orientation="vertical"] .tabs-block-shell {
    grid-template-columns: 1fr;
  }

  .tabs-block[data-orientation="vertical"] .tabs-block-list {
    flex-direction: row;
    border-right: 0;
    border-bottom: 1px solid rgb(231 229 228);
    padding-right: 0;
  }
}
</style>