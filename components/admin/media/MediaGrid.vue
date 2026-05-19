<template>
  <div class="space-y-4">
    <!-- Grid -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      <MediaItem
        v-for="file in files"
        :key="file.id"
        :file="file"
        @click="$emit('select', file)"
      />
    </div>

    <!-- Pagination -->
    <div v-if="pages > 1" class="flex items-center justify-center gap-2 pt-4">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        :disabled="page === 1"
        @click="$emit('change-page', page - 1)"
      />
      <span class="text-sm text-stone-600">Page {{ page }} of {{ pages }}</span>
      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        :disabled="page === pages"
        @click="$emit('change-page', page + 1)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MediaRecord } from '~/types/content'

defineProps<{
  files: MediaRecord[]
  page: number
  pages: number
  loading?: boolean
}>()

defineEmits<{
  'select': [file: MediaRecord]
  'change-page': [page: number]
}>()
</script>
