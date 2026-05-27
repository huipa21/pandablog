<template>
  <NodeViewWrapper
    class="imageblock-nodeview my-4 flex"
    :class="alignClass"
    data-node-view-wrapper
    :data-align="align"
  >
    <figure
      ref="figureEl"
      class="imageblock-figure relative inline-block"
      :class="{ 'is-selected': selected }"
      :style="figureStyle"
    >
      <figcaption v-if="title && titlePosition === 'top'" class="text-center text-sm text-stone-500" contenteditable="false">{{ title }}</figcaption>
      <div class="relative inline-block w-full">
        <img
          v-if="src"
          ref="imgEl"
          :src="src"
          :alt="alt"
          :width="displayWidth ?? undefined"
          :height="lockAspect ? undefined : (displayHeight ?? undefined)"
          :style="imgStyle"
          draggable="false"
          class="block max-w-full rounded-md"
          @load="onImageLoad"
        >
        <div v-else class="flex h-40 w-full items-center justify-center rounded-md border border-dashed border-stone-300 bg-stone-50 text-sm text-stone-400" contenteditable="false">
          No image selected
        </div>

        <!-- Resize handles -->
        <template v-if="src && resizeEnabled">
          <div class="imageblock-handle e" contenteditable="false" @mousedown.stop.prevent="startResize($event, 'e')" />
          <div class="imageblock-handle s" contenteditable="false" @mousedown.stop.prevent="startResize($event, 's')" />
          <div class="imageblock-handle se" contenteditable="false" @mousedown.stop.prevent="startResize($event, 'se')" />
        </template>
      </div>
      <figcaption v-if="title && titlePosition === 'bottom'" class="mt-2 text-center text-sm text-stone-500" contenteditable="false">{{ title }}</figcaption>
    </figure>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { extractMediaHash, useMediaUrl } from '~/composables/useMediaUrl'

const props = defineProps(nodeViewProps)
const { resolveMediaUrl } = useMediaUrl()

const sourceSize = computed(() => String(props.node.attrs.sourceSize ?? 'full'))
const src = computed(() => {
  const raw = String(props.node.attrs.src ?? '')
  const resolved = resolveMediaUrl(raw)
  const hash = extractMediaHash(raw)
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
const alt = computed(() => String(props.node.attrs.alt ?? ''))
const title = computed(() => String(props.node.attrs.title ?? ''))
const titlePosition = computed(() => (props.node.attrs.titlePosition as string) ?? 'bottom')
const width = computed(() => (props.node.attrs.width as number | null) ?? null)
const height = computed(() => (props.node.attrs.height as number | null) ?? null)
const displaySize = computed(() => {
  const explicit = String(props.node.attrs.displaySize ?? '')
  if (explicit) {
    if (explicit === 'viewport' || explicit === 'full-bleed') {
      return 'fill-container'
    }
    return explicit
  }

  const widthPercent = Number(props.node.attrs.widthPercent ?? 0)
  if (Number.isFinite(widthPercent) && widthPercent > 0 && widthPercent !== 100) {
    return 'custom-percent'
  }

  return width.value ? 'custom-px' : 'fill-container'
})
const displayPercent = computed(() => {
  const value = Number(props.node.attrs.displayPercent ?? props.node.attrs.widthPercent ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.min(200, value) : 100
})
const displayPx = computed(() => Number(props.node.attrs.displayPx ?? props.node.attrs.width ?? 0) || null)
const lockAspect = computed(() => props.node.attrs.lockAspect !== false)
const align = computed(() => (props.node.attrs.align as string) ?? 'center')

const alignClass = computed(() => {
  switch (align.value) {
    case 'left': return 'justify-start'
    case 'right': return 'justify-end'
    default: return 'justify-center'
  }
})

const figureEl = ref<HTMLElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)
const previewWidth = ref<number | null>(null)
const previewHeight = ref<number | null>(null)

const resizeEnabled = computed(() => displaySize.value === 'custom-px')
const displayWidth = computed(() => {
  if (displaySize.value !== 'custom-px' && displaySize.value !== 'natural') {
    return null
  }

  return previewWidth.value ?? displayPx.value ?? width.value
})
const displayHeight = computed(() => previewHeight.value ?? height.value)

const figureStyle = computed<CSSProperties>(() => {
  switch (displaySize.value) {
    case 'custom-percent':
      return { width: `${displayPercent.value}%`, maxWidth: '100%' }
    case 'custom-px':
      return { width: displayWidth.value ? `${displayWidth.value}px` : 'auto', maxWidth: '100%' }
    case 'natural':
      return { width: 'auto', maxWidth: '100%' }
    case 'fill-container':
    default:
      return { width: '100%', maxWidth: '100%' }
  }
})

const imgStyle = computed(() => ({
  width: displaySize.value === 'natural' ? 'auto' : '100%',
  maxWidth: '100%',
  height: lockAspect.value ? 'auto' : (displayHeight.value ? `${displayHeight.value}px` : undefined)
}))

function onImageLoad() {
  if (!imgEl.value) return
  const naturalWidth = imgEl.value.naturalWidth
  const naturalHeight = imgEl.value.naturalHeight

  const updates: Record<string, unknown> = {}
  if (Number(props.node.attrs.naturalWidth ?? 0) !== naturalWidth) updates.naturalWidth = naturalWidth
  if (Number(props.node.attrs.naturalHeight ?? 0) !== naturalHeight) updates.naturalHeight = naturalHeight
  if (displaySize.value === 'custom-px' && width.value === null) updates.width = naturalWidth
  if (displaySize.value === 'custom-px' && height.value === null) updates.height = naturalHeight
  if (props.node.attrs.widthPercent == null) updates.widthPercent = 100
  if (props.node.attrs.displayPercent == null) updates.displayPercent = 100

  if (Object.keys(updates).length) {
    props.updateAttributes(updates)
  }
}

interface ResizeState {
  startX: number
  startY: number
  startW: number
  startH: number
  ratio: number
  dir: 'e' | 's' | 'se'
}

let resizeState: ResizeState | null = null

function startResize(event: MouseEvent, dir: 'e' | 's' | 'se') {
  if (!resizeEnabled.value) return
  const w = imgEl.value?.getBoundingClientRect().width ?? width.value ?? 0
  const h = imgEl.value?.getBoundingClientRect().height ?? height.value ?? 0
  if (!w || !h) return
  resizeState = {
    startX: event.clientX,
    startY: event.clientY,
    startW: w,
    startH: h,
    ratio: w / h,
    dir
  }
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(event: MouseEvent) {
  if (!resizeState) return
  const dx = event.clientX - resizeState.startX
  const dy = event.clientY - resizeState.startY

  let newW = resizeState.startW
  let newH = resizeState.startH

  if (resizeState.dir === 'e' || resizeState.dir === 'se') {
    newW = Math.max(40, resizeState.startW + dx)
  }
  if (resizeState.dir === 's' || resizeState.dir === 'se') {
    newH = Math.max(40, resizeState.startH + dy)
  }

  if (lockAspect.value) {
    if (resizeState.dir === 'e') {
      newH = newW / resizeState.ratio
    } else if (resizeState.dir === 's') {
      newW = newH * resizeState.ratio
    } else {
      // se: maintain aspect via dominant axis
      if (Math.abs(dx) > Math.abs(dy)) {
        newH = newW / resizeState.ratio
      } else {
        newW = newH * resizeState.ratio
      }
    }
  }

  previewWidth.value = Math.round(newW)
  previewHeight.value = Math.round(newH)
}

function onResizeEnd() {
  if (resizeState && previewWidth.value && previewHeight.value) {
    const naturalWidth = Number(props.node.attrs.naturalWidth ?? 0)
    const widthPercentNext = Number.isFinite(naturalWidth) && naturalWidth > 0
      ? Math.max(1, Math.min(200, Math.round((previewWidth.value / naturalWidth) * 100)))
      : 100

    props.updateAttributes({
      displaySize: 'custom-px',
      displayPx: previewWidth.value,
      displayPercent: widthPercentNext,
      width: previewWidth.value,
      height: previewHeight.value,
      widthPercent: widthPercentNext
    })
  }

  previewWidth.value = null
  previewHeight.value = null
  resizeState = null
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
})

const selected = computed(() => Boolean(props.selected))
</script>

<style scoped>
.imageblock-nodeview {
  display: flex;
}

.imageblock-figure {
  position: relative;
  max-width: 100%;
}

.imageblock-figure.is-selected {
  outline: 2px solid rgb(13 148 136);
  outline-offset: 4px;
  border-radius: 0.5rem;
}

.imageblock-handle {
  position: absolute;
  background: rgb(13 148 136);
  border: 2px solid white;
  border-radius: 9999px;
  width: 12px;
  height: 12px;
  opacity: 0;
  transition: opacity 120ms ease;
  z-index: 5;
}

.imageblock-figure:hover .imageblock-handle,
.imageblock-figure.is-selected .imageblock-handle {
  opacity: 1;
}

.imageblock-handle.e {
  right: -6px;
  top: 50%;
  margin-top: -6px;
  cursor: ew-resize;
}

.imageblock-handle.s {
  bottom: -6px;
  left: 50%;
  margin-left: -6px;
  cursor: ns-resize;
}

.imageblock-handle.se {
  right: -6px;
  bottom: -6px;
  cursor: nwse-resize;
}
</style>
