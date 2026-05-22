<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="toolbarEl"
      class="block-popup-toolbar"
      :style="floatingStyles"
      contenteditable="false"
      data-testid="block-popup-toolbar"
    >
      <UDropdownMenu :items="transformItems">
        <button type="button" class="bpt-btn" title="Transform to...">
          <UIcon :name="currentIcon" class="size-4" />
          <UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
        </button>
      </UDropdownMenu>

      <button
        type="button"
        class="bpt-btn cursor-grab"
        draggable="true"
        title="Drag to move"
        @dragstart="emit('dragstart', $event)"
        @dragend="emit('dragend')"
      >
        <UIcon name="i-lucide-grip-vertical" class="size-4" />
      </button>

      <button type="button" class="bpt-btn" title="Move up" @click="emit('move-up')">
        <UIcon name="i-lucide-arrow-up" class="size-4" />
      </button>
      <button type="button" class="bpt-btn" title="Move down" @click="emit('move-down')">
        <UIcon name="i-lucide-arrow-down" class="size-4" />
      </button>

      <UDropdownMenu :items="alignItems">
        <button type="button" class="bpt-btn" title="Align">
          <UIcon :name="alignIcon" class="size-4" />
          <UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
        </button>
      </UDropdownMenu>

      <UDropdownMenu :items="moreItems">
        <button type="button" class="bpt-btn" title="More">
          <UIcon name="i-lucide-more-vertical" class="size-4" />
        </button>
      </UDropdownMenu>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue'
import type { Editor } from '@tiptap/core'

const props = defineProps<{
  editor: Editor | null
  referenceEl: HTMLElement | null
  visible: boolean
  blockType: string | null
}>()

const emit = defineEmits<{
  'move-up': []
  'move-down': []
  duplicate: []
  delete: []
  dragstart: [event: DragEvent]
  dragend: []
  transform: [type: string]
}>()

const toolbarEl = ref<HTMLElement | null>(null)
const refEl = computed(() => props.referenceEl)

const { floatingStyles } = useFloating(refEl, toolbarEl, {
  placement: 'top-start',
  middleware: [offset(8), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate
})

const currentIcon = computed(() => {
  switch (props.blockType) {
    case 'heading': return 'i-lucide-heading'
    case 'paragraph': return 'i-lucide-pilcrow'
    case 'bulletList': return 'i-lucide-list'
    case 'orderedList': return 'i-lucide-list-ordered'
    case 'blockquote': return 'i-lucide-quote'
    case 'codeBlock': return 'i-lucide-square-code'
    case 'image': return 'i-lucide-image'
    case 'mediaText': return 'i-lucide-panel-left'
    case 'customHtml': return 'i-lucide-file-code-2'
    case 'mermaid': return 'i-lucide-git-fork'
    default: return 'i-lucide-box'
  }
})

const transformItems = computed(() => [[
  { label: 'Paragraph', icon: 'i-lucide-pilcrow', onSelect: () => emit('transform', 'paragraph') },
  { label: 'Heading 1', icon: 'i-lucide-heading-1', onSelect: () => emit('transform', 'heading-1') },
  { label: 'Heading 2', icon: 'i-lucide-heading-2', onSelect: () => emit('transform', 'heading-2') },
  { label: 'Heading 3', icon: 'i-lucide-heading-3', onSelect: () => emit('transform', 'heading-3') },
  { label: 'Bullet list', icon: 'i-lucide-list', onSelect: () => emit('transform', 'bulletList') },
  { label: 'Numbered list', icon: 'i-lucide-list-ordered', onSelect: () => emit('transform', 'orderedList') },
  { label: 'Quote', icon: 'i-lucide-quote', onSelect: () => emit('transform', 'blockquote') },
  { label: 'Code', icon: 'i-lucide-square-code', onSelect: () => emit('transform', 'codeBlock') }
]])

const alignIcon = computed(() => {
  const ed = props.editor
  if (!ed) return 'i-lucide-align-left'
  if (ed.isActive({ textAlign: 'center' })) return 'i-lucide-align-center'
  if (ed.isActive({ textAlign: 'right' })) return 'i-lucide-align-right'
  if (ed.isActive({ textAlign: 'justify' })) return 'i-lucide-align-justify'
  return 'i-lucide-align-left'
})

const alignItems = computed(() => [[
  { label: 'Align left', icon: 'i-lucide-align-left', onSelect: () => setAlign('left') },
  { label: 'Align center', icon: 'i-lucide-align-center', onSelect: () => setAlign('center') },
  { label: 'Align right', icon: 'i-lucide-align-right', onSelect: () => setAlign('right') },
  { label: 'Justify', icon: 'i-lucide-align-justify', onSelect: () => setAlign('justify') }
]])

const moreItems = computed(() => [[
  { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => emit('duplicate') },
  { label: 'Move up', icon: 'i-lucide-arrow-up', onSelect: () => emit('move-up') },
  { label: 'Move down', icon: 'i-lucide-arrow-down', onSelect: () => emit('move-down') }
], [
  { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete') }
]])

function setAlign(value: 'left' | 'center' | 'right' | 'justify') {
  const ed = props.editor
  if (!ed) return
  ;(ed.chain().focus() as any).setTextAlign(value).run()
}
</script>

<style scoped>
.block-popup-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: white;
  border: 1px solid rgb(231 229 228);
  border-radius: 0.5rem;
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 1000;
}

.bpt-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 0.25rem;
  color: rgb(68 64 60);
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.bpt-btn:hover {
  background: rgb(245 245 244);
  color: rgb(13 148 136);
}
</style>
