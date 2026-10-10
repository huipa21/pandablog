<template>
  <div class="columns-block" data-type="columns-block" :data-columns="columnCount" :data-layout-preset="preset" :data-show-headers="showHeaders ? 'true' : 'false'" :data-block-width="blockWidth" :style="blockStyle">
    <div class="columns-block-grid" :style="gridStyle">
      <div v-for="(column, index) in columns" :key="index" class="columns-block-column" data-type="column-item" :data-header="columnHeader(column) || undefined">
        <div v-if="showHeaders && columnHeader(column)" class="columns-block-header">{{ columnHeader(column) }}</div>
        <div class="columns-block-content">
          <ContentRenderer v-for="(child, childIndex) in column.content ?? []" :key="childIndex" :node="child" />
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import type { JsonContent } from '~/types/content'
import ContentRenderer from './ContentRenderer.vue'
import { importedLayoutPreset, layoutWeights } from '~/utils/blockPresentation'
import { contentBlockWidthStyle } from '~/utils/contentBlockWidth'
import '~/assets/css/columns-block.css'
const props = defineProps<{ node: JsonContent }>()
const columns = computed(() => (props.node.content ?? []).filter(child => child.type === 'columnItem'))
const columnCount = computed(() => Math.max(2, Math.min(6, columns.value.length || Number(props.node.attrs?.columns) || 2)))
const preset = computed(() => importedLayoutPreset(props.node.attrs ?? {}, columnCount.value))
const showHeaders = computed(() => props.node.attrs?.showHeaders !== false)
const blockWidth = computed(() => String(props.node.attrs?.blockWidth ?? 'content'))
const blockStyle = computed(() => contentBlockWidthStyle(blockWidth.value))
const gridStyle = computed(() => ({ gridTemplateColumns: layoutWeights(preset.value, columnCount.value).map(weight => `minmax(0, ${weight}fr)`).join(' ') }))
function columnHeader(column: JsonContent) { return String(column.attrs?.header ?? '').trim() }
</script>
