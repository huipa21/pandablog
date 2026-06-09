<template>
  <button
    type="button"
    draggable="true"
    :data-media-hash="file.hash"
    class="group relative overflow-hidden rounded-[var(--pb-radius-card-outer)] border bg-[var(--pb-card-bg)] p-2 text-left transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-card-bg-hover)] hover:shadow-[var(--pb-shadow-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--pb-selected-border)]"
    :class="selected ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)] ring-2 ring-[var(--pb-selected-border)]' : 'border-[var(--pb-card-border)]'"
    @click.shift.prevent="emit('range-select', file)"
    @click.exact="emit('select', file)"
    @click.ctrl="emit('toggle-select', file)"
    @click.meta="emit('toggle-select', file)"
    @dragstart="handleDragStart"
  >
    <div class="relative aspect-square overflow-hidden rounded-[var(--pb-radius-card-inner)] bg-[var(--pb-surface-subtle)]">
      <img
        v-if="file.is_image"
        :src="file.thumbnail_url || file.url"
        :alt="file.original_name"
        class="h-full w-full object-cover"
        loading="lazy"
      >
      <div v-else class="flex h-full w-full items-center justify-center bg-[var(--pb-surface-subtle)]">
        <FileIcon :filename="file.original_name || file.extension" size="40" />
      </div>
      <div
        class="absolute left-2 top-2 flex size-5 items-center justify-center rounded border transition"
        :class="selected ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-border)]' : 'border-[var(--pb-border-strong)] bg-[var(--pb-card-bg)]'"
        @click.stop="handleSelectionClick"
      >
        <UIcon v-if="selected" name="i-lucide-check" class="size-3 text-white" />
      </div>
    </div>

    <div class="mt-2 min-w-0 space-y-1">
      <div class="truncate text-sm font-medium text-[var(--pb-text)]">{{ file.original_name }}</div>
      <div class="truncate text-xs text-[var(--pb-text-subtle)]">
        {{ formatFileSize(file.size) }}
        <template v-if="file.width && file.height"> · {{ file.width }}×{{ file.height }}</template>
      </div>
      <div class="truncate font-mono text-[11px] text-[var(--pb-text-subtle)]" :title="file.hash">ID: {{ file.hash }}</div>
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

const { formatFileSize } = useMedia()

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
