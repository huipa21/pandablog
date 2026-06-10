<template>
  <NodeViewWrapper class="mediatext-nodeview my-4 overflow-hidden rounded-lg border border-stone-200" data-node-view-wrapper :style="blockStyle">
    <div ref="rowEl" class="mediatext-row" :data-media-position="mediaPosition">
      <div class="mediatext-media" :style="mediaStyle" contenteditable="false" @mousedown="selectMediaTextNode">
        <div v-if="mediaTitle && mediaTitlePosition === 'top'" class="px-2 py-1 text-center text-sm text-stone-500">{{ mediaTitle }}</div>
        <div class="relative">
          <template v-if="mediaItems.length">
            <img
              v-if="showImagePreview"
              ref="imgEl"
              :src="mediaSrc"
              :alt="mediaAlt"
              :width="mediaDisplayWidthAttr ?? undefined"
              :height="lockAspect ? undefined : (mediaHeight ?? undefined)"
              :style="mediaElementStyle"
              class="block max-w-full rounded-md"
              @load="onImageLoad"
            >
            <MediaFileList v-else :files="mediaItems" density="compact" />
          </template>
          <div v-else class="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-stone-300 bg-stone-50 px-3 text-sm text-stone-500">
            <UIcon name="i-lucide-image-plus" class="size-6 text-stone-400" />
            <span class="text-xs">{{ t('admin.editor.nodeViews.addMediaDescription') }}</span>
            <div class="mt-1 flex flex-wrap gap-2">
              <button type="button" class="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs hover:bg-stone-100" @click="emitPick('library')">
                <UIcon name="i-lucide-images" class="mr-1 inline size-3.5" /> {{ t('admin.editor.nodeViews.mediaLibrary') }}
              </button>
              <button type="button" class="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs hover:bg-stone-100" @click="emitPick('upload')">
                <UIcon name="i-lucide-upload" class="mr-1 inline size-3.5" /> {{ t('admin.editor.nodeViews.uploadFile') }}
              </button>
              <button type="button" class="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs hover:bg-stone-100" @click="emitPick('url')">
                <UIcon name="i-lucide-link" class="mr-1 inline size-3.5" /> {{ t('admin.editor.nodeViews.pasteUrl') }}
              </button>
            </div>
          </div>
          <button
            v-if="mediaItems.length"
            type="button"
            class="absolute right-1 top-1 rounded bg-white/85 px-1.5 py-0.5 text-[10px] text-stone-600 shadow-sm hover:bg-white"
            @click="emitPick('library')"
          >{{ t('admin.editor.nodeViews.change') }}</button>
        </div>
        <div v-if="mediaTitle && mediaTitlePosition === 'bottom'" class="px-2 py-1 text-center text-sm text-stone-500">{{ mediaTitle }}</div>
      </div>

      <div class="mediatext-divider" contenteditable="false" @mousedown.prevent="startDrag" />

      <NodeViewContent class="mediatext-text" />
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import MediaFileList from '~/components/content/MediaFileList.vue'
import { mediaFileKind, mediaFilesFromAttrs } from '~/utils/mediaFiles'
import { extractMediaHash, useMediaUrl } from '~/composables/useMediaUrl'

const props = defineProps(nodeViewProps)
const { t } = useI18n()
const { resolveMediaUrl } = useMediaUrl()

const mediaSourceSize = computed(() => String(props.node.attrs.mediaSourceSize ?? 'full'))
const mediaItems = computed(() => mediaFilesFromAttrs(props.node.attrs))
const primaryMediaItem = computed(() => mediaItems.value[0] ?? null)
const showImagePreview = computed(() => mediaItems.value.length === 1 && primaryMediaItem.value ? mediaFileKind(primaryMediaItem.value) === 'image' : false)
const baseMediaSrc = computed(() => resolveMediaUrl(primaryMediaItem.value?.src ?? ''))
const mediaSrc = computed(() => {
  const raw = primaryMediaItem.value?.src ?? ''
  const resolved = baseMediaSrc.value
  const hash = extractMediaHash(raw)
  if (!hash) {
    return resolved
  }

  if (showImagePreview.value && mediaSourceSize.value === 'thumbnail') {
    const encoded = encodeURIComponent(hash)
    return `/api/media/variant/thumbnail/${encoded}`
  }

  if (showImagePreview.value && mediaSourceSize.value === 'medium') {
    const encoded = encodeURIComponent(hash)
    return `/api/media/variant/medium/${encoded}`
  }

  if (showImagePreview.value && mediaSourceSize.value === 'large') {
    const encoded = encodeURIComponent(hash)
    return `/api/media/variant/large/${encoded}`
  }

  return resolved
})
const mediaAlt = computed(() => primaryMediaItem.value?.alt || String(props.node.attrs.mediaAlt ?? ''))
const mediaTitle = computed(() => String(props.node.attrs.mediaTitle ?? ''))
const mediaTitlePosition = computed(() => String(props.node.attrs.mediaTitlePosition ?? 'bottom'))
const mediaWidth = computed(() => (props.node.attrs.mediaWidth as number | null) ?? null)
const mediaHeight = computed(() => (props.node.attrs.mediaHeight as number | null) ?? null)
const mediaDisplaySize = computed(() => {
  const explicit = String(props.node.attrs.mediaDisplaySize ?? '')
  if (explicit) {
    if (explicit === 'viewport' || explicit === 'full-bleed') {
      return 'fill-container'
    }
    return explicit
  }

  const widthPercent = Number(props.node.attrs.mediaWidthPercent ?? 0)
  if (Number.isFinite(widthPercent) && widthPercent > 0 && widthPercent !== 100) {
    return 'custom-percent'
  }

  return mediaWidth.value ? 'custom-px' : 'fill-container'
})
const mediaDisplayPercent = computed(() => {
  const value = Number(props.node.attrs.mediaDisplayPercent ?? props.node.attrs.mediaWidthPercent ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.min(200, value) : 100
})
const mediaDisplayPx = computed(() => Number(props.node.attrs.mediaDisplayPx ?? props.node.attrs.mediaWidth ?? 0) || null)
const mediaNaturalWidth = computed(() => Number(props.node.attrs.mediaNaturalWidth ?? 0) || null)
const mediaNaturalHeight = computed(() => Number(props.node.attrs.mediaNaturalHeight ?? 0) || null)
const lockAspect = computed(() => props.node.attrs.lockAspect !== false)
const mediaPosition = computed(() => String(props.node.attrs.mediaPosition ?? 'left'))
const blockWidth = computed(() => String(props.node.attrs.blockWidth ?? 'content'))
const ratio = computed(() => Number(props.node.attrs.ratio ?? 0.5))

const rowEl = ref<HTMLElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)

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

const mediaStyle = computed(() => ({ flex: `0 0 ${(ratio.value * 100).toFixed(2)}%` }))

function onImageLoad() {
  if (!imgEl.value) return
  const naturalWidth = imgEl.value.naturalWidth
  const naturalHeight = imgEl.value.naturalHeight
  const updates: Record<string, unknown> = {}

  if (props.node.attrs.mediaNaturalWidth == null) updates.mediaNaturalWidth = naturalWidth
  if (props.node.attrs.mediaNaturalHeight == null) updates.mediaNaturalHeight = naturalHeight
  if (mediaDisplaySize.value === 'custom-px' && mediaWidth.value === null) updates.mediaWidth = naturalWidth
  if (mediaDisplaySize.value === 'custom-px' && mediaHeight.value === null) updates.mediaHeight = naturalHeight
  if (props.node.attrs.mediaWidthPercent == null) updates.mediaWidthPercent = 100
  if (props.node.attrs.mediaDisplayPercent == null) updates.mediaDisplayPercent = 100

  if (Object.keys(updates).length) {
    props.updateAttributes(updates)
  }
}

function emitPick(source: 'library' | 'upload' | 'url') {
  // Bubble a DOM event up to BlockEditor.vue which owns the media picker
  // (mediaText nodes are rendered via Vue NodeView, so component events
  // do not propagate normally to the wrapping editor component).
  rowEl.value?.dispatchEvent(new CustomEvent('mediatext-pick', {
    bubbles: true,
    detail: { source, nodePos: props.getPos?.() ?? null }
  }))
}

function selectMediaTextNode(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target && target.closest('button, a, input, textarea, select')) {
    return
  }

  const getPos = props.getPos as (() => number) | number | undefined
  const nodePos = typeof getPos === 'function' ? getPos() : typeof getPos === 'number' ? getPos : null
  if (typeof nodePos !== 'number') return

  event.preventDefault()
  props.editor.chain().focus().setNodeSelection(nodePos).run()
}

let dragStart = 0
let dragWidth = 0

function startDrag(event: MouseEvent) {
  if (!rowEl.value) return
  dragStart = event.clientX
  dragWidth = rowEl.value.getBoundingClientRect().width
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', endDrag)
}

function onDrag(event: MouseEvent) {
  if (!rowEl.value || !dragWidth) return
  const dx = event.clientX - dragStart
  const startRatio = ratio.value
  let newRatio = startRatio + dx / dragWidth
  newRatio = Math.max(0.15, Math.min(0.85, newRatio))
  props.updateAttributes({ ratio: Number(newRatio.toFixed(4)) })
}

function endDrag() {
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', endDrag)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', endDrag)
})
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
  background: rgb(250 250 249);
  min-width: 0;
}

.mediatext-divider {
  width: 6px;
  cursor: col-resize;
  background: transparent;
  border-left: 1px solid rgb(231 229 228);
  border-right: 1px solid rgb(231 229 228);
  transition: background-color 120ms ease;
  flex: 0 0 auto;
}

.mediatext-divider:hover {
  background: rgba(13, 148, 136, 0.15);
}

.mediatext-text {
  flex: 1 1 auto;
  padding: 0.75rem 1rem;
  min-width: 0;
}
</style>

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
  background: rgb(250 250 249);
  min-width: 0;
}

.mediatext-divider {
  width: 6px;
  cursor: col-resize;
  background: transparent;
  border-left: 1px solid rgb(231 229 228);
  border-right: 1px solid rgb(231 229 228);
  transition: background-color 120ms ease;
  flex: 0 0 auto;
}

.mediatext-divider:hover {
  background: rgba(13, 148, 136, 0.15);
}

.mediatext-text {
  flex: 1 1 auto;
  padding: 0.75rem 1rem;
  min-width: 0;
}
</style>
