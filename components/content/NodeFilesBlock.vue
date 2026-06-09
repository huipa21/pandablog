<template>
  <div class="files-block" data-type="files-block" :data-block-width="blockWidth" :style="blockStyle">
    <div class="files-block-surface">
      <MediaFileList v-if="files.length" :files="files" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { JsonContent } from '~/types/content'
import MediaFileList from './MediaFileList.vue'
import { normalizeMediaFileItems } from '~/utils/mediaFiles'

const props = defineProps<{
  node: JsonContent
}>()

const files = computed(() => normalizeMediaFileItems(props.node.attrs?.files))
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs?.blockWidth ?? 'content')))

const blockStyle = computed<CSSProperties>(() => {
  switch (blockWidth.value) {
    case 'wide':
      return {
        width: 'min(120%, 72rem)',
        maxWidth: 'calc(100vw - 2rem)',
        position: 'relative' as const,
        left: '50%',
        transform: 'translateX(-50%)'
      }
    case 'full-bleed':
      return {
        width: '100vw',
        maxWidth: '100vw',
        position: 'relative' as const,
        left: '50%',
        transform: 'translateX(-50%)'
      }
    case 'content':
    default:
      return { width: '100%', maxWidth: '100%' }
  }
})

function normalizeBlockWidth(value: string) {
  return value === 'wide' || value === 'full-bleed' ? value : 'content'
}
</script>

<style scoped>
.files-block {
  display: block;
  margin: 1rem 0;
}

.files-block-surface {
  border: 1px solid var(--pb-divider);
  border-radius: var(--pb-radius-card-inner);
  background: var(--pb-surface-subtle);
  padding: 0.85rem;
}
</style>