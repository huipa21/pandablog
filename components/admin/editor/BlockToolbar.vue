<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="toolbarEl"
      class="block-toolbar"
      :style="floatingStyles"
      contenteditable="false"
      data-testid="block-popup-toolbar"
      @mousedown.prevent
    >
      <!-- Block-level actions (always visible when toolbar is shown) -->
      <UDropdownMenu :items="transformItems">
        <button type="button" class="bt-btn" title="Transform to...">
          <UIcon :name="currentIcon" class="size-4" />
          <UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
        </button>
      </UDropdownMenu>

      <button
        type="button"
        class="bt-btn cursor-grab"
        draggable="true"
        title="Drag to move"
        @dragstart="emit('dragstart', $event)"
        @dragend="emit('dragend')"
      >
        <UIcon name="i-lucide-grip-vertical" class="size-4" />
      </button>

      <button type="button" class="bt-btn" title="Move up" @click="emit('move-up')">
        <UIcon name="i-lucide-arrow-up" class="size-4" />
      </button>
      <button type="button" class="bt-btn" title="Move down" @click="emit('move-down')">
        <UIcon name="i-lucide-arrow-down" class="size-4" />
      </button>

      <UDropdownMenu :items="alignItems">
        <button type="button" class="bt-btn" title="Align">
          <UIcon :name="alignIcon" class="size-4" />
          <UIcon name="i-lucide-chevron-down" class="size-3 opacity-60" />
        </button>
      </UDropdownMenu>

      <!-- Inline formatting section (only when text is selected) -->
      <template v-if="hasTextSelection">
        <div class="bt-separator" />

        <button
          type="button"
          class="bt-btn"
          :class="{ 'bt-btn-active': editor?.isActive('bold') }"
          title="Bold"
          @mousedown.prevent="editor?.chain().focus().toggleBold().run()"
        >
          <UIcon name="i-lucide-bold" class="size-4" />
        </button>
        <button
          type="button"
          class="bt-btn"
          :class="{ 'bt-btn-active': editor?.isActive('italic') }"
          title="Italic"
          @mousedown.prevent="editor?.chain().focus().toggleItalic().run()"
        >
          <UIcon name="i-lucide-italic" class="size-4" />
        </button>
        <button
          type="button"
          class="bt-btn"
          :class="{ 'bt-btn-active': editor?.isActive('link') }"
          title="Link"
          @mousedown.prevent="setLink"
        >
          <UIcon name="i-lucide-link" class="size-4" />
        </button>

        <UDropdownMenu :items="inlineMoreItems">
          <button type="button" class="bt-btn" title="More formatting">
            <UIcon name="i-lucide-chevron-down" class="size-4" />
          </button>
        </UDropdownMenu>
      </template>

      <!-- 3-dot More menu -->
      <UDropdownMenu :items="moreItems">
        <button type="button" class="bt-btn" title="More options">
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
  hasTextSelection: boolean
}>()

const emit = defineEmits<{
  'move-up': []
  'move-down': []
  duplicate: []
  delete: []
  'copy-block': []
  'cut-block': []
  'add-before': []
  'add-after': []
  'edit-html': []
  'add-footnote': []
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
    case 'preformatted': return 'i-lucide-text-quote'
    case 'horizontalRule': return 'i-lucide-minus'
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
  { label: 'Code', icon: 'i-lucide-square-code', onSelect: () => emit('transform', 'codeBlock') },
  { label: 'Preformatted', icon: 'i-lucide-text-quote', onSelect: () => emit('transform', 'preformatted') },
  { label: 'Separator', icon: 'i-lucide-minus', onSelect: () => emit('transform', 'horizontalRule') }
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
  { label: 'Copy', icon: 'i-lucide-clipboard-copy', onSelect: () => emit('copy-block') },
  { label: 'Cut', icon: 'i-lucide-scissors', onSelect: () => emit('cut-block') },
  { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => emit('duplicate') }
], [
  { label: 'Add before', icon: 'i-lucide-arrow-up-to-line', onSelect: () => emit('add-before') },
  { label: 'Add after', icon: 'i-lucide-arrow-down-to-line', onSelect: () => emit('add-after') }
], [
  { label: 'Edit as HTML', icon: 'i-lucide-file-code-2', onSelect: () => emit('edit-html') }
], [
  { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete') }
]])

const inlineMoreItems = computed(() => [[
  { label: 'Strikethrough', icon: 'i-lucide-strikethrough', onSelect: () => props.editor?.chain().focus().toggleStrike().run() },
  { label: 'Inline code', icon: 'i-lucide-code', onSelect: () => props.editor?.chain().focus().toggleCode().run() },
  { label: 'Highlight', icon: 'i-lucide-highlighter', onSelect: () => props.editor?.chain().focus().toggleHighlight().run() },
  { label: 'Subscript', icon: 'i-lucide-subscript', onSelect: () => props.editor?.chain().focus().toggleSubscript().run() },
  { label: 'Superscript', icon: 'i-lucide-superscript', onSelect: () => props.editor?.chain().focus().toggleSuperscript().run() },
  { label: 'Footnote', icon: 'i-lucide-footprints', onSelect: () => emit('add-footnote') }
]])

function setAlign(value: 'left' | 'center' | 'right' | 'justify') {
  const ed = props.editor
  if (!ed) return
  ;(ed.chain().focus() as any).setTextAlign(value).run()
}

function setLink() {
  const editor = props.editor
  if (!editor) return

  const previousHref = editor.getAttributes('link').href as string | undefined
  const href = window.prompt('URL', previousHref ?? 'https://')

  if (href === null) return

  if (!href.trim()) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }

  editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
}

</script>

<style scoped>
.block-toolbar {
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

.bt-btn {
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

.bt-btn:hover {
  background: rgb(245 245 244);
  color: rgb(13 148 136);
}

.bt-btn-active {
  background: rgb(204 251 241);
  color: rgb(13 148 136);
}

.bt-separator {
  width: 1px;
  height: 20px;
  background: rgb(214 211 209);
  margin: 0 4px;
}
</style>
