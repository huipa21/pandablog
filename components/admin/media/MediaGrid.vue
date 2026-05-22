<template>
  <div
    class="space-y-4"
    @pointerdown="beginDragSelection"
    @pointermove="updateDragSelection"
    @pointerup="finishDragSelection"
    @pointercancel="finishDragSelection"
    @dragstart.capture="handleNativeDragStart"
  >
    <div v-if="viewMode === 'grid'" class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      <MediaItem
        v-for="file in files"
        :key="file.id"
        :file="file"
        :selected="selectedHashes.includes(file.hash)"
        @select="handleSelect"
        @toggle-select="handleToggleSelect"
        @range-select="emit('range-select', $event)"
      />
    </div>

    <div v-else class="space-y-1">
      <MediaItemRow
        v-for="file in files"
        :key="file.id"
        :file="file"
        :selected="selectedHashes.includes(file.hash)"
        @select="handleSelect"
        @toggle-select="handleToggleSelect"
        @range-select="emit('range-select', $event)"
      />
    </div>

    <div v-if="showPagination && pages > 1" class="flex items-center justify-center gap-2 pt-2">
      <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" :disabled="page <= 1" @click="emit('change-page', page - 1)" />
      <span class="text-sm text-stone-600">Page {{ page }} of {{ pages }}</span>
      <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" :disabled="page >= pages" @click="emit('change-page', page + 1)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MediaRecord } from '~/types/content'
import MediaItem from '~/components/admin/media/MediaItem.vue'
import MediaItemRow from '~/components/admin/media/MediaItemRow.vue'

withDefaults(defineProps<{
  files: MediaRecord[]
  page: number
  pages: number
  selectedHashes?: string[]
  viewMode?: 'grid' | 'list'
  showPagination?: boolean
}>(), {
  selectedHashes: () => [],
  viewMode: 'grid',
  showPagination: true
})

const emit = defineEmits<{
  'select': [file: MediaRecord]
  'toggle-select': [file: MediaRecord]
  'range-select': [file: MediaRecord]
  'drag-select': [hash: string]
  'change-page': [page: number]
}>()

const dragCandidate = ref<{ hash: string; x: number; y: number } | null>(null)
const dragSelecting = ref(false)
const draggedHashes = ref<Set<string>>(new Set())
const suppressClick = ref(false)

function beginDragSelection(event: PointerEvent) {
  if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) return

  const hash = hashFromEvent(event)
  if (!hash) return

  dragCandidate.value = { hash, x: event.clientX, y: event.clientY }
  draggedHashes.value = new Set()
}

function updateDragSelection(event: PointerEvent) {
  const candidate = dragCandidate.value
  if (!candidate) return

  const moved = Math.abs(event.clientX - candidate.x) > 4 || Math.abs(event.clientY - candidate.y) > 4

  if (!dragSelecting.value && moved) {
    dragSelecting.value = true
    suppressClick.value = true
    addDraggedHash(candidate.hash)
  }

  if (!dragSelecting.value) return
  event.preventDefault()
  const hash = hashFromEvent(event)
  if (hash) addDraggedHash(hash)
}

function finishDragSelection() {
  dragCandidate.value = null
  dragSelecting.value = false
  draggedHashes.value = new Set()

  if (suppressClick.value) {
    window.setTimeout(() => {
      suppressClick.value = false
    }, 0)
  }
}

function addDraggedHash(hash: string) {
  if (draggedHashes.value.has(hash)) return
  const next = new Set(draggedHashes.value)
  next.add(hash)
  draggedHashes.value = next
  emit('drag-select', hash)
}

function handleNativeDragStart(event: DragEvent) {
  if (dragCandidate.value) {
    event.preventDefault()
  }
}

function handleSelect(file: MediaRecord) {
  if (suppressClick.value) return
  emit('select', file)
}

function handleToggleSelect(file: MediaRecord) {
  if (suppressClick.value) return
  emit('toggle-select', file)
}

function hashFromEvent(event: Event) {
  const target = event.target as HTMLElement | null
  return target?.closest<HTMLElement>('[data-media-hash]')?.dataset.mediaHash || ''
}
</script>
