<template>
  <NodeViewWrapper class="mediatext-nodeview my-4 overflow-hidden rounded-lg border border-stone-200" data-node-view-wrapper>
    <div ref="rowEl" class="mediatext-row" :data-media-position="mediaPosition">
      <div class="mediatext-media" :style="mediaStyle" contenteditable="false">
        <div v-if="mediaTitle && mediaTitlePosition === 'top'" class="px-2 py-1 text-center text-sm text-stone-500">{{ mediaTitle }}</div>
        <div class="relative">
          <img
            v-if="mediaSrc"
            ref="imgEl"
            :src="mediaSrc"
            :alt="mediaAlt"
            :width="mediaWidth ?? undefined"
            :height="mediaHeight ?? undefined"
            class="block w-full rounded-md object-cover"
            @load="onImageLoad"
          >
          <div v-else class="flex h-40 w-full items-center justify-center bg-stone-100 text-sm text-stone-400">
            <button type="button" class="rounded-md border border-dashed border-stone-300 px-3 py-1.5 hover:bg-stone-200" @click="onPickMedia">Select media</button>
          </div>
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

const props = defineProps(nodeViewProps)
const emit = defineEmits<{ pickMedia: [] }>()

const mediaSrc = computed(() => String(props.node.attrs.mediaSrc ?? ''))
const mediaAlt = computed(() => String(props.node.attrs.mediaAlt ?? ''))
const mediaTitle = computed(() => String(props.node.attrs.mediaTitle ?? ''))
const mediaTitlePosition = computed(() => String(props.node.attrs.mediaTitlePosition ?? 'bottom'))
const mediaWidth = computed(() => (props.node.attrs.mediaWidth as number | null) ?? null)
const mediaHeight = computed(() => (props.node.attrs.mediaHeight as number | null) ?? null)
const mediaPosition = computed(() => String(props.node.attrs.mediaPosition ?? 'left'))
const ratio = computed(() => Number(props.node.attrs.ratio ?? 0.5))

const rowEl = ref<HTMLElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)

const mediaStyle = computed(() => ({ flex: `0 0 ${(ratio.value * 100).toFixed(2)}%` }))

function onImageLoad() {
  if (!imgEl.value) return
  if (mediaWidth.value === null) {
    props.updateAttributes({
      mediaWidth: imgEl.value.naturalWidth,
      mediaHeight: imgEl.value.naturalHeight
    })
  }
}

function onPickMedia() {
  emit('pickMedia')
  // Also surface for parents listening on the editor instance via DOM event.
  rowEl.value?.dispatchEvent(new CustomEvent('mediatext-pick', { bubbles: true }))
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
