<template>
  <div class="media-file-list" :data-density="density">
    <a
      v-for="(file, index) in files"
      :key="`${file.src}-${index}`"
      class="media-file-card"
      :href="resolvedSrc(file)"
      target="_blank"
      rel="noopener"
    >
      <span class="media-file-icon" :data-kind="fileKind(file)" aria-hidden="true">
        <FileIcon :filename="mediaFileName(file)" :size="iconSize" />
      </span>
      <span class="media-file-body">
        <span class="media-file-name">{{ mediaFileName(file) }}</span>
        <span class="media-file-detail">{{ mediaFileDetail(file) }}</span>
      </span>
      <UIcon name="i-lucide-download" class="media-file-download" aria-hidden="true" />
    </a>
  </div>
</template>

<script setup lang="ts">
import type { MediaFileItem } from '~/utils/mediaFiles'
import { mediaFileDetail, mediaFileKind, mediaFileName } from '~/utils/mediaFiles'

const props = withDefaults(defineProps<{
  files: MediaFileItem[]
  density?: 'comfortable' | 'compact'
}>(), {
  density: 'comfortable'
})

const { resolveMediaUrl } = useMediaUrl()
const iconSize = computed(() => props.density === 'compact' ? 24 : 30)

function resolvedSrc(file: MediaFileItem) {
  return resolveMediaUrl(file.src)
}

function fileKind(file: MediaFileItem) {
  const name = mediaFileName(file)
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['doc', 'docx'].includes(ext)) return 'word'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet'
  if (['ppt', 'pptx'].includes(ext)) return 'presentation'
  return mediaFileKind(file)
}
</script>

<style scoped>
.media-file-list {
  display: grid;
  gap: 0.75rem;
}

.media-file-card {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.85rem;
  border: 1px solid var(--pb-divider);
  border-radius: var(--pb-radius-card-inner);
  background: var(--pb-card-bg);
  color: var(--pb-text);
  padding: 0.85rem;
  text-decoration: none;
  transition: background-color 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
}

.media-file-card:hover {
  border-color: var(--pb-selected-border);
  background: var(--pb-selected-bg);
  box-shadow: var(--pb-shadow-sm);
}

.media-file-icon {
  display: inline-flex;
  width: 2.55rem;
  height: 2.55rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: var(--pb-radius-md);
  background: var(--pb-surface-subtle);
}

.media-file-body {
  min-width: 0;
  flex: 1 1 auto;
}

.media-file-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
  line-height: 1.25;
}

.media-file-detail {
  display: block;
  margin-top: 0.2rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--pb-text-subtle);
  font-size: 0.82rem;
  line-height: 1.2;
}

.media-file-download {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  color: var(--pb-icon-muted);
}

.media-file-list[data-density="compact"] {
  gap: 0.55rem;
}

.media-file-list[data-density="compact"] .media-file-card {
  gap: 0.7rem;
  padding: 0.65rem;
}

.media-file-list[data-density="compact"] .media-file-icon {
  width: 2.2rem;
  height: 2.2rem;
}

.media-file-list[data-density="compact"] .media-file-icon-svg {
  width: 1.35rem;
  height: 1.35rem;
}
</style>