<template>
  <NodeViewWrapper class="files-block my-4" data-type="files-block" :data-block-width="blockWidth" :style="blockStyle">
    <div ref="rootEl" class="files-block-surface" contenteditable="false" @mousedown="selectFilesBlockNode">
      <MediaFileList v-if="files.length" :files="files" />
      <div v-else class="files-block-empty">
        <UIcon name="i-lucide-files" class="size-7 text-stone-400" />
        <span class="text-sm font-medium text-stone-700">Add files</span>
        <span class="text-xs text-stone-500">Attach documents, images, archives, or other downloads.</span>
        <div class="mt-1 flex flex-wrap justify-center gap-2">
          <button type="button" class="files-block-pick-button" @click="emitPick('library')">
            <UIcon name="i-lucide-images" class="mr-1 inline size-3.5" /> Media library
          </button>
          <button type="button" class="files-block-pick-button" @click="emitPick('upload')">
            <UIcon name="i-lucide-upload" class="mr-1 inline size-3.5" /> Upload files
          </button>
          <button type="button" class="files-block-pick-button" @click="emitPick('url')">
            <UIcon name="i-lucide-link" class="mr-1 inline size-3.5" /> Paste URL
          </button>
        </div>
      </div>
      <button
        v-if="files.length"
        type="button"
        class="files-block-change"
        @click="emitPick('library')"
      >Change</button>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import MediaFileList from '~/components/content/MediaFileList.vue'
import { normalizeMediaFileItems } from '~/utils/mediaFiles'

const props = defineProps(nodeViewProps)
const rootEl = ref<HTMLElement | null>(null)

const files = computed(() => normalizeMediaFileItems(props.node.attrs.files))
const blockWidth = computed(() => normalizeBlockWidth(String(props.node.attrs.blockWidth ?? 'content')))

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
        width: 'calc(100% + 2 * (var(--pb-editor-gutter, 32px) + var(--pb-editor-gap, 8px)))',
        maxWidth: 'calc(100% + 2 * (var(--pb-editor-gutter, 32px) + var(--pb-editor-gap, 8px)))',
        position: 'relative' as const,
        left: '50%',
        transform: 'translateX(-50%)'
      }
    case 'content':
    default:
      return { width: '100%', maxWidth: '100%' }
  }
})

function emitPick(source: 'library' | 'upload' | 'url') {
  rootEl.value?.dispatchEvent(new CustomEvent('mediatext-pick', {
    bubbles: true,
    detail: { source, nodePos: props.getPos?.() ?? null }
  }))
}

function selectFilesBlockNode(event: MouseEvent) {
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

function normalizeBlockWidth(value: string) {
  return value === 'wide' || value === 'full-bleed' ? value : 'content'
}
</script>

<style scoped>
.files-block {
  display: block;
}

.files-block-surface {
  position: relative;
  border: 1px solid var(--pb-divider);
  border-radius: var(--pb-radius-card-inner);
  background: var(--pb-surface-subtle);
  padding: 0.85rem;
}

.files-block-empty {
  display: flex;
  min-height: 10rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: 1px dashed var(--pb-divider);
  border-radius: var(--pb-radius-card-inner);
  background: var(--pb-card-bg);
  padding: 1rem;
  text-align: center;
}

.files-block-pick-button {
  border: 1px solid var(--pb-divider);
  border-radius: var(--pb-radius-sm);
  background: var(--pb-card-bg);
  color: var(--pb-text);
  font-size: 0.75rem;
  padding: 0.3rem 0.55rem;
}

.files-block-pick-button:hover {
  border-color: var(--pb-selected-border);
  background: var(--pb-selected-bg);
}

.files-block-change {
  position: absolute;
  right: 0.45rem;
  top: 0.45rem;
  border-radius: var(--pb-radius-sm);
  background: var(--pb-card-bg);
  box-shadow: var(--pb-shadow-sm);
  color: var(--pb-text-subtle);
  font-size: 0.68rem;
  padding: 0.15rem 0.45rem;
}
</style>