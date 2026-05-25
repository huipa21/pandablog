<template>
  <button
    type="button"
    draggable="true"
    :data-media-hash="file.hash"
    class="group relative overflow-hidden rounded-lg border bg-white p-2 text-left transition hover:border-teal-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
    :class="selected ? 'border-teal-500 ring-2 ring-teal-100' : 'border-stone-200'"
    @click.shift.prevent="emit('range-select', file)"
    @click.exact="emit('select', file)"
    @click.ctrl="emit('toggle-select', file)"
    @click.meta="emit('toggle-select', file)"
    @dragstart="handleDragStart"
  >
    <div class="relative aspect-square overflow-hidden rounded-md bg-stone-100">
      <img
        v-if="file.is_image"
        :src="file.thumbnail_url || file.url"
        :alt="file.original_name"
        class="h-full w-full object-cover"
        loading="lazy"
      >
      <div v-else class="flex h-full w-full items-center justify-center bg-stone-100">
        <UIcon :name="getFileIcon(file.extension, file.mime_type)" class="size-10 text-stone-500" />
      </div>
      <div
        class="absolute left-2 top-2 flex size-5 items-center justify-center rounded border transition"
        :class="selected ? 'border-teal-600 bg-teal-600' : 'border-stone-300 bg-white'"
        @click.stop="handleSelectionClick"
      >
        <UIcon v-if="selected" name="i-lucide-check" class="size-3 text-white" />
      </div>
    </div>

    <div class="mt-2 min-w-0 space-y-1">
      <div class="truncate text-sm font-medium text-stone-900">{{ file.original_name }}</div>
      <div class="truncate text-xs text-stone-500">
        {{ formatFileSize(file.size) }}
        <template v-if="file.width && file.height"> · {{ file.width }}×{{ file.height }}</template>
      </div>
      <div class="truncate font-mono text-[11px] text-stone-400" :title="file.hash">ID: {{ file.hash }}</div>
    </div>
  </button>
</template>

<script setup lang="ts">
import type { MediaRecord } from '~/types/content'

const props = defineProps<{
  file: MediaRecord
  selected?: boolean
}>()

const emit = defineEmits<{
  'select': [file: MediaRecord]
  'toggle-select': [file: MediaRecord]
  'range-select': [file: MediaRecord]
}>()

const { formatFileSize, getFileIcon } = useMedia()

function handleDragStart(event: DragEvent) {
  event.dataTransfer?.setData('application/x-pandablog-media-hash', props.file.hash)
  event.dataTransfer?.setData('text/plain', props.file.hash)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove'
  }
}

function handleSelectionClick(event: MouseEvent) {
  if (event.shiftKey) {
    emit('range-select', props.file)
  } else {
    emit('toggle-select', props.file)
  }
}
</script>
