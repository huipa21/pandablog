<template>
  <div class="mediatext-nodeview my-4 overflow-hidden rounded-[var(--pb-radius-card-inner)] border border-[var(--pb-divider)]" :style="blockStyle">
    <div class="mediatext-row" :data-media-position="mediaPosition">
      <div class="mediatext-media" :style="{ flex: `0 0 ${(ratio * 100).toFixed(2)}%` }">
        <div v-if="mediaTitle && mediaTitlePosition === 'top'" class="px-2 py-1 text-center text-sm text-[var(--pb-text-subtle)]">{{ mediaTitle }}</div>
        <div class="relative">
          <template v-if="mediaItems.length">
            <img
              v-if="showImagePreview"
              :src="resolvedMediaSrc"
              :alt="mediaAlt"
              :width="mediaDisplayWidthAttr || undefined"
              :height="lockAspect ? undefined : (mediaHeight || undefined)"
              :style="mediaElementStyle"
              class="block max-w-full rounded-md"
              loading="lazy"
            >
            <MediaFileList v-else :files="mediaItems" density="compact" />
          </template>
        </div>
        <div v-if="mediaTitle && mediaTitlePosition === 'bottom'" class="px-2 py-1 text-center text-sm text-[var(--pb-text-subtle)]">{{ mediaTitle }}</div>
      </div>

      <div class="mediatext-divider" aria-hidden="true" />

      <div class="mediatext-text">
        <ContentRenderer v-for="(child, i) in props.node.content ?? []" :key="i" :node="child" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { JsonContent } from '~/types/content'
import ContentRenderer from './ContentRenderer.vue'
import MediaFileList from './MediaFileList.vue'
import { mediaFileKind, mediaFilesFromAttrs } from '~/utils/mediaFiles'
import { extractMediaHash } from '~/composables/useMediaUrl'

const props = defineProps<{
  node: JsonContent
}>()

const { resolveMediaUrl } = useMediaUrl()

const mediaItems = computed(() => mediaFilesFromAttrs(props.node.attrs))
const primaryMediaItem = computed(() => mediaItems.value[0] ?? null)
const showImagePreview = computed(() => mediaItems.value.length === 1 && primaryMediaItem.value ? mediaFileKind(primaryMediaItem.value) === 'image' : false)
const mediaSrc = computed(() => primaryMediaItem.value?.src ?? '')
const mediaSourceSize = computed(() => String(props.node.attrs?.mediaSourceSize ?? 'full'))
const mediaAlt = computed(() => primaryMediaItem.value?.alt || String(props.node.attrs?.mediaAlt ?? ''))
const mediaTitle = computed(() => String(props.node.attrs?.mediaTitle ?? ''))
const mediaTitlePosition = computed(() => String(props.node.attrs?.mediaTitlePosition ?? 'bottom'))
const mediaWidth = computed(() => Number(props.node.attrs?.mediaWidth ?? 0) || null)
const mediaHeight = computed(() => Number(props.node.attrs?.mediaHeight ?? 0) || null)
const mediaDisplaySize = computed(() => {
  const explicit = String(props.node.attrs?.mediaDisplaySize ?? '')
  if (explicit) {
    if (explicit === 'viewport' || explicit === 'full-bleed') {
      return 'fill-container'
    }
    return explicit
  }

  const widthPercent = Number(props.node.attrs?.mediaWidthPercent ?? 0)
  if (Number.isFinite(widthPercent) && widthPercent > 0 && widthPercent !== 100) {
    return 'custom-percent'
  }

  return mediaWidth.value ? 'custom-px' : 'fill-container'
})
const mediaDisplayPercent = computed(() => {
  const value = Number(props.node.attrs?.mediaDisplayPercent ?? props.node.attrs?.mediaWidthPercent ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.min(200, value) : 100
})
const mediaDisplayPx = computed(() => Number(props.node.attrs?.mediaDisplayPx ?? props.node.attrs?.mediaWidth ?? 0) || null)
const mediaNaturalWidth = computed(() => Number(props.node.attrs?.mediaNaturalWidth ?? 0) || null)
const mediaNaturalHeight = computed(() => Number(props.node.attrs?.mediaNaturalHeight ?? 0) || null)
const lockAspect = computed(() => props.node.attrs?.lockAspect !== false)
const mediaPosition = computed(() => String(props.node.attrs?.mediaPosition ?? 'left'))
const blockWidth = computed(() => String(props.node.attrs?.blockWidth ?? 'content'))
const ratio = computed(() => {
  const v = Number(props.node.attrs?.ratio ?? 0.5)
  return Number.isFinite(v) ? Math.max(0.15, Math.min(0.85, v)) : 0.5
})

const baseResolvedMediaSrc = computed(() => resolveMediaUrl(mediaSrc.value))
const resolvedMediaSrc = computed(() => {
  const resolved = baseResolvedMediaSrc.value
  if (!showImagePreview.value) {
    return resolved
  }

  const hash = extractMediaHash(mediaSrc.value)
  if (!hash) {
    return resolved
  }

  const encoded = encodeURIComponent(hash)
  if (mediaSourceSize.value === 'thumbnail') {
    return `/api/media/variant/thumbnail/${encoded}`
  }
  if (mediaSourceSize.value === 'medium') {
    return `/api/media/variant/medium/${encoded}`
  }
  if (mediaSourceSize.value === 'large') {
    return `/api/media/variant/large/${encoded}`
  }

  return resolved
})

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

const mediaDisplayWidthAttr = computed(() => {
  if (mediaDisplaySize.value === 'custom-px' || mediaDisplaySize.value === 'natural') {
    return mediaDisplayPx.value ?? mediaWidth.value
  }

  return null
})

const mediaElementStyle = computed(() => ({
  width: mediaDisplaySize.value === 'natural'
    ? 'auto'
    : mediaDisplaySize.value === 'custom-percent'
      ? `${mediaDisplayPercent.value}%`
      : mediaDisplaySize.value === 'custom-px'
        ? (mediaDisplayPx.value ? `${mediaDisplayPx.value}px` : '100%')
        : '100%',
  maxWidth: '100%',
  height: lockAspect.value ? 'auto' : (mediaHeight.value ? `${mediaHeight.value}px` : undefined),
  aspectRatio: lockAspect.value && mediaNaturalWidth.value && mediaNaturalHeight.value
    ? `${mediaNaturalWidth.value} / ${mediaNaturalHeight.value}`
    : undefined
}))
</script>

<style scoped>
.mediatext-row {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-height: 8rem;
}

.mediatext-row[data-media-position="right"] {
  flex-direction: row-reverse;
}

.mediatext-media {
  padding: 0.75rem;
  background: var(--pb-surface-subtle);
  min-width: 0;
}

.mediatext-divider {
  width: 6px;
  background: transparent;
  border-left: 1px solid var(--pb-divider);
  border-right: 1px solid var(--pb-divider);
  flex: 0 0 auto;
}

.mediatext-text {
  flex: 1 1 auto;
  padding: 0.75rem 1rem;
  min-width: 0;
}
</style>
