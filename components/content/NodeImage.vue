<template>
  <div class="imageblock-nodeview my-4 flex" :class="alignClass" :data-align="align">
    <figure class="imageblock-figure relative inline-block" :style="figureStyle">
      <figcaption v-if="title && titlePosition === 'top'" class="text-center text-sm text-[var(--pb-text-subtle)]">{{ title }}</figcaption>
      <div class="relative inline-block w-full">
        <img
          :src="resolvedSrc"
          :alt="alt"
          :width="displayWidthAttr || undefined"
          :height="lockAspect ? undefined : (height || undefined)"
          :style="imgStyle"
          class="block max-w-full rounded-md"
          loading="lazy"
        >
      </div>
      <figcaption v-if="title && titlePosition !== 'top'" class="mt-2 text-center text-sm text-[var(--pb-text-subtle)]">{{ title }}</figcaption>
    </figure>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { JsonContent } from '~/types/content'
import { extractMediaHash } from '~/composables/useMediaUrl'

const props = defineProps<{
  node: JsonContent
}>()

const { resolveMediaUrl } = useMediaUrl()

const src = computed(() => typeof props.node.attrs?.src === 'string' ? props.node.attrs.src : '')
const sourceSize = computed(() => typeof props.node.attrs?.sourceSize === 'string' ? props.node.attrs.sourceSize : 'full')
const resolvedSrc = computed(() => {
  const resolved = resolveMediaUrl(src.value)
  const hash = extractMediaHash(src.value)
  if (!hash) {
    return resolved
  }

  const encoded = encodeURIComponent(hash)
  if (sourceSize.value === 'thumbnail') {
    return `/api/media/variant/thumbnail/${encoded}`
  }
  if (sourceSize.value === 'medium') {
    return `/api/media/variant/medium/${encoded}`
  }
  if (sourceSize.value === 'large') {
    return `/api/media/variant/large/${encoded}`
  }

  return resolved
})
const alt = computed(() => typeof props.node.attrs?.alt === 'string' ? props.node.attrs.alt : '')
const title = computed(() => typeof props.node.attrs?.title === 'string' ? props.node.attrs.title : '')
const titlePosition = computed(() => typeof props.node.attrs?.titlePosition === 'string' ? props.node.attrs.titlePosition : 'bottom')
const width = computed(() => Number(props.node.attrs?.width ?? 0) || null)
const height = computed(() => Number(props.node.attrs?.height ?? 0) || null)
const displaySize = computed(() => {
  const explicit = typeof props.node.attrs?.displaySize === 'string' ? props.node.attrs.displaySize : ''
  if (explicit) {
    if (explicit === 'viewport' || explicit === 'full-bleed') {
      return 'fill-container'
    }
    return explicit
  }

  const widthPercent = Number(props.node.attrs?.widthPercent ?? 0)
  if (Number.isFinite(widthPercent) && widthPercent > 0 && widthPercent !== 100) {
    return 'custom-percent'
  }

  return width.value ? 'custom-px' : 'fill-container'
})
const displayPercent = computed(() => {
  const value = Number(props.node.attrs?.displayPercent ?? props.node.attrs?.widthPercent ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.min(200, value) : 100
})
const displayPx = computed(() => Number(props.node.attrs?.displayPx ?? props.node.attrs?.width ?? 0) || null)
const lockAspect = computed(() => props.node.attrs?.lockAspect !== false)
const align = computed(() => typeof props.node.attrs?.align === 'string' ? props.node.attrs.align : 'center')

const alignClass = computed(() => {
  switch (align.value) {
    case 'left': return 'justify-start'
    case 'right': return 'justify-end'
    default: return 'justify-center'
  }
})

const figureStyle = computed<CSSProperties>(() => {
  switch (displaySize.value) {
    case 'custom-percent':
      return { width: `${displayPercent.value}%`, maxWidth: '100%' }
    case 'custom-px':
      return { width: displayPx.value ? `${displayPx.value}px` : 'auto', maxWidth: '100%' }
    case 'natural':
      return { width: 'auto', maxWidth: '100%' }
    case 'fill-container':
    default:
      return { width: '100%', maxWidth: '100%' }
  }
})

const displayWidthAttr = computed(() => {
  if (displaySize.value === 'custom-px' || displaySize.value === 'natural') {
    return displayPx.value ?? width.value
  }

  return null
})

const imgStyle = computed(() => ({
  width: displaySize.value === 'natural' ? 'auto' : '100%',
  maxWidth: '100%',
  height: lockAspect.value ? 'auto' : (height.value ? `${height.value}px` : undefined)
}))
</script>
