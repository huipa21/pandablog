<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <MediaItem
        v-for="file in files"
        :key="file.id"
        :file="file"
        :selected="selectedHashes.includes(file.hash)"
        @select="emit('select', $event)"
      />
    </div>

    <div v-if="pages > 1" class="flex items-center justify-center gap-2 pt-2">
      <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" :disabled="page <= 1" @click="emit('change-page', page - 1)" />
      <span class="text-sm text-stone-600">Page {{ page }} of {{ pages }}</span>
      <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" :disabled="page >= pages" @click="emit('change-page', page + 1)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MediaRecord } from '~/types/content'
import MediaItem from '~/components/admin/MediaItem.vue'

withDefaults(defineProps<{
  files: MediaRecord[]
  page: number
  pages: number
  selectedHashes?: string[]
}>(), {
  selectedHashes: () => []
})

const emit = defineEmits<{
  'select': [file: MediaRecord]
  'change-page': [page: number]
}>()
</script>
