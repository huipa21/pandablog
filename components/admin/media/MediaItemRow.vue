<template>
  <button
    type="button"
    :data-media-hash="file.hash"
    class="group flex w-full items-center gap-3 rounded-[var(--pb-radius-card-outer)] border bg-[var(--pb-card-bg)] px-3 py-2 text-left transition hover:border-[var(--pb-selected-border)] hover:bg-[var(--pb-card-bg-hover)] hover:shadow-[var(--pb-shadow-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--pb-selected-border)]"
    :class="selected ? 'border-[var(--pb-selected-border)] bg-[var(--pb-selected-bg)] ring-2 ring-[var(--pb-selected-border)]' : 'border-[var(--pb-card-border)]'"
    @click.shift.prevent="emit('range-select', file)"
    @click.exact="emit('select', file)"
    @click.ctrl="emit('toggle-select', file)"
    @click.meta="emit('toggle-select', file)"
  >
    <input
      type="checkbox"
      class="size-4 shrink-0 rounded border-[var(--pb-border-strong)]"
      :checked="selected"
      @click.stop="handleSelectionClick"
    >

    <div class="relative size-10 shrink-0 overflow-hidden rounded-[var(--pb-radius-sm)] bg-[var(--pb-surface-subtle)]">
      <img
        v-if="file.is_image"
        :src="file.thumbnail_url || file.url"
        :alt="file.original_name"
        class="h-full w-full object-cover"
        loading="lazy"
      >
      <div v-else class="flex h-full w-full items-center justify-center">
        <UIcon :name="getFileIcon(file.extension, file.mime_type)" class="size-5 text-[var(--pb-icon-muted)]" />
      </div>
      <div v-if="selected" class="absolute inset-0 flex items-center justify-center bg-[var(--pb-selected-border)]/70">
        <UIcon name="i-lucide-check" class="size-4 text-white" />
      </div>
    </div>

    <div class="min-w-0 flex-1">
      <div class="truncate text-sm font-medium text-[var(--pb-text)]">{{ file.original_name }}</div>
      <div class="truncate font-mono text-[11px] text-[var(--pb-text-subtle)]" :title="file.hash">ID: {{ file.hash }}</div>
    </div>

    <div class="hidden w-20 shrink-0 text-xs text-[var(--pb-text-subtle)] sm:block">{{ file.mime_type?.split('/')[1] || file.extension }}</div>
    <div class="hidden w-20 shrink-0 text-xs text-[var(--pb-text-subtle)] md:block">{{ formatFileSize(file.size) }}</div>
    <div class="hidden w-24 shrink-0 text-xs text-[var(--pb-text-subtle)] lg:block">
      <template v-if="file.width && file.height">{{ file.width }}×{{ file.height }}</template>
    </div>
    <div class="hidden w-24 shrink-0 text-xs text-[var(--pb-text-subtle)] xl:block">{{ formatDate(file.uploaded_at || file.created_at) }}</div>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function handleSelectionClick(event: MouseEvent) {
  if (event.shiftKey) {
    emit('range-select', props.file)
  } else {
    emit('toggle-select', props.file)
  }
}
</script>
