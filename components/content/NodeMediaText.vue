<template>
  <div class="mediatext-block my-6 flex overflow-hidden rounded-lg border border-stone-200" :class="mediaPosition === 'right' ? 'flex-row-reverse' : ''" :style="blockStyle">
    <div class="mediatext-block-media bg-stone-50 p-3" :style="{ flex: `0 0 ${(ratio * 100).toFixed(2)}%` }">
      <figcaption v-if="mediaTitle && mediaTitlePosition === 'top'" class="mb-2 text-center text-sm text-stone-500">{{ mediaTitle }}</figcaption>
      <template v-if="mediaSrc">
        <img
          v-if="kind === 'image'"
          :src="resolvedMediaSrc"
          :alt="mediaAlt"
          :width="mediaDisplayWidthAttr || undefined"
          :height="lockAspect ? undefined : (mediaHeight || undefined)"
          :style="mediaElementStyle"
          class="block max-w-full rounded-md"
          loading="lazy"
        >
        <video
          v-else-if="kind === 'video'"
          :src="resolvedMediaSrc"
          controls
          :style="mediaElementStyle"
          class="block max-w-full rounded-md"
        />
        <audio v-else-if="kind === 'audio'" :src="resolvedMediaSrc" controls :style="mediaElementStyle" class="block max-w-full" />
        <embed
          v-else-if="kind === 'pdf'"
          :src="resolvedMediaSrc"
          type="application/pdf"
          :style="mediaElementStyle"
          class="block max-w-full rounded-md"
        >
        <a
          v-else
          :href="resolvedMediaSrc"
          target="_blank"
          rel="noopener"
          class="flex items-center gap-3 rounded-md border border-stone-200 bg-white p-3 text-sm hover:border-teal-400 hover:bg-teal-50"
        >
          <UIcon :name="icon" class="size-8 text-stone-500" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-stone-800">{{ mediaName || mediaAlt || displayName }}</span>
            <span class="block text-xs text-stone-500">{{ formatBytes(mediaSize) }} {{ mediaMime }}</span>
          </span>
          <UIcon name="i-lucide-download" class="size-4 shrink-0 text-stone-400" />
        </a>
      </template>
      <figcaption v-if="mediaTitle && mediaTitlePosition !== 'top'" class="mt-2 text-center text-sm text-stone-500">{{ mediaTitle }}</figcaption>
    </div>
    <div class="mediatext-block-text min-w-0 flex-1 px-4 py-3">
      <ContentRenderer v-for="(child, i) in props.node.content ?? []" :key="i" :node="child" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { JsonContent } from '~/types/content'
import ContentRenderer from './ContentRenderer.vue'
import { classifyMedia, mediaIcon, formatBytes } from '~/composables/useMediaKind'
import { extractMediaHash } from '~/composables/useMediaUrl'

const props = defineProps<{
  node: JsonContent
}>()

const { resolveMediaUrl } = useMediaUrl()

const mediaSrc = computed(() => String(props.node.attrs?.mediaSrc ?? ''))
const mediaSourceSize = computed(() => String(props.node.attrs?.mediaSourceSize ?? 'full'))
const mediaAlt = computed(() => String(props.node.attrs?.mediaAlt ?? ''))
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
const mediaMime = computed(() => String(props.node.attrs?.mediaMime ?? ''))
const mediaName = computed(() => String(props.node.attrs?.mediaName ?? ''))
const mediaSize = computed(() => Number(props.node.attrs?.mediaSize ?? 0) || null)
const blockWidth = computed(() => String(props.node.attrs?.blockWidth ?? 'content'))
const ratio = computed(() => {
  const v = Number(props.node.attrs?.ratio ?? 0.5)
  return Number.isFinite(v) ? Math.max(0.15, Math.min(0.85, v)) : 0.5
})

const baseResolvedMediaSrc = computed(() => resolveMediaUrl(mediaSrc.value))
const kind = computed(() => classifyMedia(mediaMime.value, baseResolvedMediaSrc.value))
const icon = computed(() => mediaIcon(mediaMime.value, baseResolvedMediaSrc.value))
const displayName = computed(() => {
  const last = (baseResolvedMediaSrc.value.split('/').pop() ?? '').split('?')[0] ?? ''
  return last || 'Attachment'
})

const resolvedMediaSrc = computed(() => {
  const resolved = baseResolvedMediaSrc.value
  if (kind.value !== 'image') {
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
