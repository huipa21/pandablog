<template>
  <button
    type="button"
    draggable="true"
    class="group relative overflow-hidden rounded-lg border bg-white p-2 text-left transition hover:border-teal-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
    :class="selected ? 'border-teal-500 ring-2 ring-teal-100' : 'border-stone-200'"
    @click="emit('select', file)"
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
      <div v-if="selected" class="absolute right-2 top-2 rounded-full bg-teal-600 p-1 text-white">
        <UIcon name="i-lucide-check" class="size-3" />
      </div>
    </div>

    <div class="mt-2 min-w-0 space-y-1">
      <div class="truncate text-sm font-medium text-stone-900">{{ file.original_name }}</div>
      <div class="truncate text-xs text-stone-500">
        {{ formatFileSize(file.size) }}
        <template v-if="file.width && file.height"> · {{ file.width }}×{{ file.height }}</template>
      </div>
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
}>()

const { formatFileSize, getFileIcon } = useMedia()

function handleDragStart(event: DragEvent) {
  event.dataTransfer?.setData('application/x-pandablog-media-hash', props.file.hash)
  event.dataTransfer?.setData('text/plain', props.file.hash)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove'
  }
}
</script>
