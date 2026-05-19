<template>
  <button
    type="button"
    @click="$emit('click')"
    class="group relative overflow-hidden rounded-lg border border-stone-200 bg-white p-2 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500"
  >
    <!-- Thumbnail or icon -->
    <div class="relative aspect-square overflow-hidden rounded bg-stone-100">
      <template v-if="isImage">
        <NuxtImg
          :src="file.thumbnail_path || file.url"
          :alt="file.original_name"
          class="h-full w-full object-cover"
          loading="lazy"
        />
      </template>
      <template v-else>
        <div class="flex h-full w-full items-center justify-center bg-stone-200">
          <UIcon :name="getFileIcon(file.extension)" class="size-8 text-stone-500" />
        </div>
      </template>
    </div>

    <!-- Info -->
    <div class="mt-2 space-y-1">
      <p class="truncate text-sm font-medium text-stone-900">{{ file.original_name }}</p>
      <p class="text-xs text-stone-500">
        {{ formatFileSize(file.size) }}
        <template v-if="file.width && file.height">
          • {{ file.width }}×{{ file.height }}px
        </template>
      </p>
    </div>

    <!-- Hover actions -->
    <div class="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
      <UButton
        icon="i-lucide-eye"
        color="primary"
        variant="ghost"
        size="sm"
        @click.stop="$emit('preview')"
      />
      <UButton
        icon="i-lucide-copy"
        color="primary"
        variant="ghost"
        size="sm"
        @click.stop="copyUrl"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="sm"
        @click.stop="$emit('delete')"
      />
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MediaRecord } from '~/types/content'

const props = defineProps<{
  file: MediaRecord
}>()

defineEmits<{
  'click': []
  'preview': []
  'delete': []
}>()

const { formatFileSize, getFileIcon, getFileType, getFileUrl } = useMedia()

const isImage = computed(() => getFileType(props.file.extension) === 'image')

function copyUrl() {
  const url = getFileUrl(props.file.id)
  navigator.clipboard.writeText(url)
}
</script>
