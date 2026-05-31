<template>
  <details v-if="blockName === 'columnsBlock'" open class="rounded-md border border-stone-200 bg-white p-3">
    <summary class="cursor-pointer text-sm font-medium text-stone-900">Columns</summary>
    <div class="space-y-4">
      <!-- Row 1: Column count and Proportions in 2-column grid -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <UFormField label="Column count">
            <USelect
              :model-value="String(columnsCount)"
              :items="columnCountItems"
              @update:model-value="setColumnsCount"
            />
          </UFormField>
        </div>
        <div>
          <UFormField label="Proportions">
            <USelect
              :model-value="columnsProportions"
              :items="columnProportionItems"
              @update:model-value="setColumnsProportions"
            />
          </UFormField>
        </div>
      </div>

      <!-- Column headers and alignment in 2-column grid -->
      <div>
        <div class="text-xs font-medium uppercase tracking-wider text-stone-400 mb-2">Column settings</div>
        <div class="space-y-2 rounded-md border border-stone-200 bg-stone-50 p-2">
          <div v-for="column in columnItems" :key="column.index" class="grid grid-cols-3 gap-2 items-end pb-2 border-b border-stone-200 last:border-b-0">
            <div class="col-span-1">
              <div class="text-xs font-medium text-stone-600">Column {{ column.index + 1 }}</div>
              <UInput
                :model-value="String(column.attrs.header ?? '')"
                placeholder="Header (optional)"
                size="sm"
                @update:model-value="setColumnHeader(column.index, $event)"
              />
            </div>
            <div class="col-span-1">
              <div class="text-xs font-medium text-stone-600">Width %</div>
              <UInput
                type="number"
                min="1"
                max="100"
                placeholder="Auto"
                size="sm"
                :model-value="column.attrs.widthPercent ? String(column.attrs.widthPercent) : ''"
                @update:model-value="setColumnWidthPercent(column.index, $event)"
              />
            </div>
            <div class="col-span-1">
              <div class="text-xs font-medium text-stone-600">Align</div>
              <USelect
                :model-value="String(column.attrs.headerAlignment ?? 'left')"
                :items="[{label: 'Left', value: 'left'}, {label: 'Center', value: 'center'}, {label: 'Right', value: 'right'}]"
                size="sm"
                @update:model-value="setColumnHeaderAlignment(column.index, $event)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Add column button -->
      <div v-if="columnsCount < 6" class="flex gap-2">
        <UButton
          type="button"
          icon="i-lucide-plus"
          size="sm"
          variant="soft"
          color="neutral"
          @click="addColumn"
        >
          Add Column
        </UButton>
      </div>

      <!-- Spacing settings -->
      <div>
        <div class="text-xs font-medium uppercase tracking-wider text-stone-400 mb-2">Spacing</div>
        <div class="space-y-2">
          <UFormField label="Gap between columns">
            <UInput
              :model-value="String(attrs.columnGap ?? '1rem')"
              placeholder="1rem"
              size="sm"
              @update:model-value="updateAttrs({ columnGap: String($event) })"
            />
          </UFormField>
          <UFormField label="Margin above block">
            <UInput
              :model-value="String(attrs.marginTop ?? '1rem')"
              placeholder="1rem"
              size="sm"
              @update:model-value="updateAttrs({ marginTop: String($event) })"
            />
          </UFormField>
          <UFormField label="Margin below block">
            <UInput
              :model-value="String(attrs.marginBottom ?? '1rem')"
              placeholder="1rem"
              size="sm"
              @update:model-value="updateAttrs({ marginBottom: String($event) })"
            />
          </UFormField>
        </div>
      </div>

      <!-- Block width -->
      <UFormField label="Whole block width">
        <USelect
          :model-value="String(attrs.blockWidth ?? 'content')"
          :items="blockWidthItems"
          @update:model-value="updateAttrs({ blockWidth: String($event) })"
        />
      </UFormField>
    </div>
  </details>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { JsonContent } from '~/types/content'

const props = defineProps<{
  editor: Editor | null
  blockName: string | null
  attrs: any
  columnItems: Array<{ index: number; attrs: Record<string, unknown> }>
  columnsCount: number
  columnsProportions: string
  columnCountItems: Array<{ label: string; value: string }>
  columnProportionItems: Array<{ label: string; value: string }>
  blockWidthItems: Array<{ label: string; value: string }>
  updateAttrs: (attrs: Record<string, unknown>) => void
  updateNestedChildAttrs: (blockType: string, childType: string, childIndex: number, nextAttrs: Record<string, unknown>) => void
  selectedBlockJson: (blockType: string) => JsonContent | null
  replaceSelectedBlockJson: (blockType: string, nextJson: JsonContent) => void
  normalizeColumnProportions: (value: string, count: number) => string
  normalizeColumnItems: (content: JsonContent[] | undefined, count: number) => JsonContent[]
}>()

const emit = defineEmits<{
  'update-columns-count': [value: unknown]
  'update-columns-proportions': [value: unknown]
  'update-column-header': [index: number, value: unknown]
  'update-column-width-percent': [index: number, value: unknown]
  'update-column-header-alignment': [index: number, value: unknown]
  'add-column': []
}>()

function setColumnHeader(index: number, value: unknown) {
  props.updateNestedChildAttrs('columnsBlock', 'columnItem', index, { header: String(value ?? '').trim() })
}

function setColumnWidthPercent(index: number, value: unknown) {
  const percentStr = String(value ?? '').trim()
  if (!percentStr) {
    props.updateNestedChildAttrs('columnsBlock', 'columnItem', index, { widthPercent: 0 })
    return
  }
  const percent = Number(percentStr)
  if (Number.isFinite(percent) && percent > 0 && percent <= 100) {
    props.updateNestedChildAttrs('columnsBlock', 'columnItem', index, { widthPercent: Math.round(percent) })
  }
}

function setColumnHeaderAlignment(index: number, value: unknown) {
  const alignment = String(value ?? 'left')
  if (['left', 'center', 'right'].includes(alignment)) {
    props.updateNestedChildAttrs('columnsBlock', 'columnItem', index, { headerAlignment: alignment })
  }
}

function setColumnsCount(value: unknown) {
  const countStr = String(value ?? '2')
  const count = Math.max(2, Math.min(6, Number(countStr) || 2))
  const nextJson = props.selectedBlockJson('columnsBlock')
  if (!nextJson) return

  nextJson.attrs = {
    ...(nextJson.attrs ?? {}),
    columns: count,
    proportions: props.normalizeColumnProportions(String(nextJson.attrs?.proportions ?? ''), count),
    customPercentages: ''
  }
  nextJson.content = props.normalizeColumnItems(nextJson.content, count)
  props.replaceSelectedBlockJson('columnsBlock', nextJson)
}

function setColumnsProportions(value: unknown) {
  const proportions = props.normalizeColumnProportions(String(value ?? '1-1'), props.columnsCount)
  props.updateAttrs({ columns: props.columnsCount, proportions })
}

function addColumn() {
  if (props.columnsCount >= 6) return
  setColumnsCount(props.columnsCount + 1)
}
</script>
