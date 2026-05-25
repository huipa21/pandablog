<template>
  <NodeViewWrapper class="mediatext-nodeview my-4 overflow-hidden rounded-lg border border-stone-200" data-node-view-wrapper>
    <div ref="rowEl" class="mediatext-row" :data-media-position="mediaPosition">
      <div class="mediatext-media" :style="mediaStyle" contenteditable="false">
        <div v-if="mediaTitle && mediaTitlePosition === 'top'" class="px-2 py-1 text-center text-sm text-stone-500">{{ mediaTitle }}</div>
        <div class="relative">
          <template v-if="mediaSrc">
            <img
              v-if="kind === 'image'"
              ref="imgEl"
              :src="mediaSrc"
              :alt="mediaAlt"
              :width="mediaWidth ?? undefined"
              :height="mediaHeight ?? undefined"
              :style="mediaElementStyle"
              class="block max-w-full rounded-md object-cover"
              @load="onImageLoad"
            >
            <video
              v-else-if="kind === 'video'"
              :src="mediaSrc"
              controls
              :style="mediaElementStyle"
              class="block max-w-full rounded-md"
            />
            <audio
              v-else-if="kind === 'audio'"
              :src="mediaSrc"
              controls
              :style="mediaElementStyle"
              class="block max-w-full"
            />
            <embed
              v-else-if="kind === 'pdf'"
              :src="mediaSrc"
              type="application/pdf"
              :style="mediaElementStyle"
              class="block max-w-full rounded-md"
            >
            <a
              v-else
              :href="mediaSrc"
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
          <div v-else class="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-stone-300 bg-stone-50 px-3 text-sm text-stone-500">
            <UIcon name="i-lucide-image-plus" class="size-6 text-stone-400" />
            <span class="text-xs">Add media of any type — image, video, audio, document, archive…</span>
            <div class="mt-1 flex flex-wrap gap-2">
              <button type="button" class="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs hover:bg-stone-100" @click="emitPick('library')">
                <UIcon name="i-lucide-images" class="mr-1 inline size-3.5" /> Media library
              </button>
              <button type="button" class="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs hover:bg-stone-100" @click="emitPick('upload')">
                <UIcon name="i-lucide-upload" class="mr-1 inline size-3.5" /> Upload file
              </button>
              <button type="button" class="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs hover:bg-stone-100" @click="emitPick('url')">
                <UIcon name="i-lucide-link" class="mr-1 inline size-3.5" /> Paste URL
              </button>
            </div>
          </div>
          <button
            v-if="mediaSrc"
            type="button"
            class="absolute right-1 top-1 rounded bg-white/85 px-1.5 py-0.5 text-[10px] text-stone-600 shadow-sm hover:bg-white"
            @click="emitPick('library')"
          >Change</button>
        </div>
        <div v-if="mediaTitle && mediaTitlePosition === 'bottom'" class="px-2 py-1 text-center text-sm text-stone-500">{{ mediaTitle }}</div>
      </div>

      <div class="mediatext-divider" contenteditable="false" @mousedown.prevent="startDrag" />

      <NodeViewContent class="mediatext-text" />
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { classifyMedia, mediaIcon, formatBytes } from '~/composables/useMediaKind'
import { useMediaUrl } from '~/composables/useMediaUrl'

const props = defineProps(nodeViewProps)
const { resolveMediaUrl } = useMediaUrl()

const mediaSrc = computed(() => resolveMediaUrl(String(props.node.attrs.mediaSrc ?? '')))
const mediaAlt = computed(() => String(props.node.attrs.mediaAlt ?? ''))
const mediaTitle = computed(() => String(props.node.attrs.mediaTitle ?? ''))
const mediaTitlePosition = computed(() => String(props.node.attrs.mediaTitlePosition ?? 'bottom'))
const mediaWidth = computed(() => (props.node.attrs.mediaWidth as number | null) ?? null)
const mediaHeight = computed(() => (props.node.attrs.mediaHeight as number | null) ?? null)
const mediaWidthPercent = computed(() => {
  const value = Number(props.node.attrs.mediaWidthPercent ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.min(200, value) : null
})
const mediaPosition = computed(() => String(props.node.attrs.mediaPosition ?? 'left'))
const mediaMime = computed(() => String(props.node.attrs.mediaMime ?? ''))
const mediaName = computed(() => String(props.node.attrs.mediaName ?? ''))
const mediaSize = computed(() => (props.node.attrs.mediaSize as number | null) ?? null)
const ratio = computed(() => Number(props.node.attrs.ratio ?? 0.5))

const rowEl = ref<HTMLElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)

const kind = computed(() => classifyMedia(mediaMime.value, mediaSrc.value))
const icon = computed(() => mediaIcon(mediaMime.value, mediaSrc.value))
const displayName = computed(() => {
  const last = (mediaSrc.value.split('/').pop() ?? '').split('?')[0] ?? ''
  return last || 'Attachment'
})

const mediaElementStyle = computed(() => ({
  width: mediaWidthPercent.value ? `${mediaWidthPercent.value}%` : (mediaWidth.value ? `${mediaWidth.value}px` : '100%'),
  maxWidth: '100%',
  height: mediaHeight.value ? `${mediaHeight.value}px` : undefined
}))

const mediaStyle = computed(() => ({ flex: `0 0 ${(ratio.value * 100).toFixed(2)}%` }))

function onImageLoad() {
  if (!imgEl.value) return
  const naturalWidth = imgEl.value.naturalWidth
  const naturalHeight = imgEl.value.naturalHeight
  const updates: Record<string, unknown> = {}

  if (props.node.attrs.mediaNaturalWidth == null) updates.mediaNaturalWidth = naturalWidth
  if (props.node.attrs.mediaNaturalHeight == null) updates.mediaNaturalHeight = naturalHeight
  if (mediaWidth.value === null) updates.mediaWidth = naturalWidth
  if (mediaHeight.value === null) updates.mediaHeight = naturalHeight
  if (props.node.attrs.mediaWidthPercent == null) updates.mediaWidthPercent = 100

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
