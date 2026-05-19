<template>
  <div ref="editorContainer" class="block-editor-root relative" data-testid="block-editor">
    <ClientOnly>
      <div class="relative">
        <InlineToolbar v-if="editor" :editor="editor" />

        <EditorContent v-if="editor" :editor="editor" class="pandablog-block-editor tiptap-editor" />

        <!-- Per-block toolbar: + button and drag handle shown on the active block -->
        <div
          v-if="activeBlockRect && activeBlockIndex >= 0"
          class="pointer-events-none absolute left-0 right-0"
          :style="{ top: `${activeBlockRect.top}px`, height: `${activeBlockRect.height}px` }"
        >
          <!-- Drag handle on the left -->
          <button
            type="button"
            class="pointer-events-auto absolute -left-10 top-1 flex size-7 cursor-grab items-center justify-center rounded border border-stone-200 bg-white text-stone-400 shadow-sm transition hover:border-teal-300 hover:text-teal-700 active:cursor-grabbing"
            title="Drag to reorder"
            data-testid="block-drag-handle"
            draggable="true"
            @dragstart="onBlockDragStart"
            @dragend="onBlockDragEnd"
          >
            <UIcon name="i-lucide-grip-vertical" class="size-4" />
          </button>

          <!-- + button on the right (after the block) -->
          <button
            type="button"
            class="pointer-events-auto absolute -right-10 top-1 flex size-7 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm transition hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700"
            title="Add block below"
            data-testid="block-add-button"
            @click.stop.prevent="addBlockAfterCurrent"
          >
            <UIcon name="i-lucide-plus" class="size-4" />
          </button>
        </div>

        <!-- Drop indicators between blocks during drag -->
        <template v-if="draggingIndex !== null">
          <div
            v-for="indicator in dropIndicators"
            :key="indicator.index"
            class="pointer-events-auto absolute left-0 right-0 h-8"
            :style="{ top: `${indicator.top - 16}px` }"
            data-testid="block-drop-indicator"
            @dragover.prevent="dragOverIndex = indicator.index"
            @dragleave="dragOverIndex = null"
            @drop.prevent="onBlockDrop(indicator.index)"
          >
            <div
              class="mx-auto h-1 rounded transition-colors"
              :class="dragOverIndex === indicator.index ? 'bg-teal-500' : 'bg-transparent'"
            />
          </div>
        </template>

        <!-- Slash command popup menu -->
        <SlashCommandMenu
          :open="slashOpen"
          :query="slashQuery"
          :items="slashItems"
          :selected-index="slashSelectedIndex"
          :position="slashPosition"
          @pick="handleSlashPick"
          @select-index="slashSelectedIndex = $event"
        />

        <!-- Block inserter panel (full sidebar) -->
        <BlockInserterPanel :open="inserterOpen" @close="closeInserter" @insert="handleInserterPick" />

        <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="handlePickedImage">
      </div>
      <template #fallback>
        <div class="min-h-96 rounded-md border border-dashed border-stone-300 p-5 text-sm text-stone-500">Loading editor...</div>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { EditorContent, useEditor, VueNodeViewRenderer } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Color from '@tiptap/extension-color'
import Dropcursor from '@tiptap/extension-dropcursor'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import type { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import { common, createLowlight } from 'lowlight'
import type { JsonContent } from '~/types/content'
import { MermaidNode } from '~/extensions/mermaid'
import { normalizeWikiTarget, WikiLinkNode } from '~/extensions/wikiLink'
import MermaidNodeView from '~/components/admin/editor/MermaidNodeView.vue'
import WikiLinkNodeView from '~/components/admin/editor/WikiLinkNodeView.vue'
// Explicit imports: Nuxt registers nested components with a path prefix
// (e.g. `AdminEditorBlockInserterPanel`), so the short tag names used below
// would not auto-resolve. Importing them directly guarantees they render.
import InlineToolbar from '~/components/admin/editor/InlineToolbar.vue'
import SlashCommandMenu from '~/components/admin/editor/SlashCommandMenu.vue'
import BlockInserterPanel from '~/components/admin/editor/BlockInserterPanel.vue'

const props = defineProps<{
  modelValue: JsonContent
}>()

const emit = defineEmits<{
  'update:modelValue': [value: JsonContent]
}>()

const lowlight = createLowlight(common)
const editorStore = useEditorStore()
const blockRegistry = useBlockRegistry()
const imageInput = ref<HTMLInputElement | null>(null)
const editorContainer = ref<HTMLElement | null>(null)

// Active block tracking (for + button and drag handle placement)
const activeBlockRect = ref<{ top: number; height: number } | null>(null)
const activeBlockIndex = ref<number>(-1)

// Drag and drop state
const draggingIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const dropIndicators = ref<Array<{ index: number; top: number }>>([])

// Slash command state
const slashOpen = ref(false)
const slashQuery = ref('')
const slashSelectedIndex = ref(0)
const slashPosition = ref({ top: 0, left: 0 })
const slashRange = ref<{ from: number; to: number } | null>(null)
const slashItems = computed(() => {
  const items = blockRegistry.searchBlocks(slashQuery.value)
  return items.filter((b) => b.implemented)
})

// Inserter state
const inserterOpen = ref(false)
const insertAfterIndex = ref<number>(-1)
const pendingImageInsertPos = ref<number | null>(null)
let trackFrame: number | null = null

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    // NO BubbleMenu or FloatingMenu extensions here.
    // The <BubbleMenu> Vue component in InlineToolbar.vue handles its own plugin internally.
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      horizontalRule: false
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    FontFamily,
    HorizontalRule,
    Dropcursor.configure({ color: '#0f766e', width: 2 }),
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: 'text'
    }),
    Image.configure({
      allowBase64: false,
      inline: false
    }),
    Link.configure({
      autolink: true,
      linkOnPaste: true,
      openOnClick: false,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow'
      }
    }),
    Placeholder.configure({
      placeholder: ({ node }) => node.type.name === 'heading' ? 'Heading' : 'Type / to choose a block'
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph']
    }),
    Table.configure({
      resizable: true
    }),
    TableRow,
    TableHeader,
    TableCell,
    MermaidNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(MermaidNodeView)
      }
    }),
    WikiLinkNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(WikiLinkNodeView)
      }
    })
  ],
  editorProps: {
    attributes: {
      class: 'min-h-[520px] focus:outline-none'
    },
    handlePaste(_view, event) {
      return uploadImagesFromList(event.clipboardData?.files)
    },
    handleDrop(_view, event) {
      const handled = uploadImagesFromList(event.dataTransfer?.files)
      if (handled) event.preventDefault()
      return handled
    },
    handleTextInput(view, from, _to, text) {
      if (text === '/' && isAtBlockStart(view, from)) {
        window.setTimeout(() => openSlashMenu(view, from), 0)
      }
      return false
    },
    handleKeyDown(_view, event) {
      if (!slashOpen.value) return false

      if (event.key === 'Escape') {
        closeSlashMenu()
        return true
      }
      if (event.key === 'ArrowDown') {
        slashSelectedIndex.value = (slashSelectedIndex.value + 1) % Math.max(slashItems.value.length, 1)
        return true
      }
      if (event.key === 'ArrowUp') {
        slashSelectedIndex.value = (slashSelectedIndex.value - 1 + slashItems.value.length) % Math.max(slashItems.value.length, 1)
        return true
      }
      if (event.key === 'Enter') {
        const item = slashItems.value[slashSelectedIndex.value]
        if (item) handleSlashPick(item.name)
        return true
      }
      if (event.key === 'Backspace') {
        if (slashQuery.value === '') {
          closeSlashMenu()
        }
        return false
      }
      return false
    }
  },
  onUpdate({ editor: ed }) {
    refreshSlashQuery(ed)
    scheduleTrackActiveBlock(ed)
    emit('update:modelValue', ed.getJSON() as JsonContent)
    syncSelectedBlock(ed)
  },
  onSelectionUpdate({ editor: ed }) {
    refreshSlashQuery(ed)
    scheduleTrackActiveBlock(ed)
    syncSelectedBlock(ed)
  },
  onBlur() {
    window.setTimeout(() => {
      if (!editor.value?.isFocused) {
        activeBlockRect.value = null
      }
    }, 150)
    closeSlashMenu()
  },
  onFocus({ editor: ed }) {
    scheduleTrackActiveBlock(ed)
  }
})

defineExpose({ editor })

watch(() => props.modelValue, (value) => {
  const ed = editor.value
  if (!ed || !value) return
  if (JSON.stringify(ed.getJSON()) !== JSON.stringify(value)) {
    ed.commands.setContent(value, false)
  }
}, { deep: true })

watch(slashItems, (items) => {
  if (slashSelectedIndex.value >= items.length) {
    slashSelectedIndex.value = Math.max(0, items.length - 1)
  }
})

onMounted(() => {
  window.addEventListener('scroll', handleViewportChange, true)
  window.addEventListener('resize', handleViewportChange)
  if (editor.value) {
    scheduleTrackActiveBlock(editor.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleViewportChange, true)
  window.removeEventListener('resize', handleViewportChange)
  if (trackFrame !== null) {
    window.cancelAnimationFrame(trackFrame)
  }
  editor.value?.destroy()
})

function handleViewportChange() {
  if (editor.value) {
    scheduleTrackActiveBlock(editor.value)
  }
}

function scheduleTrackActiveBlock(ed: Editor) {
  nextTick(() => {
    if (!import.meta.client || ed.isDestroyed) {
      return
    }

    if (trackFrame !== null) {
      window.cancelAnimationFrame(trackFrame)
    }

    trackFrame = window.requestAnimationFrame(() => {
      trackFrame = null
      if (!ed.isDestroyed) {
        trackActiveBlock(ed)
      }
    })
  })
}

// ─── ACTIVE BLOCK TRACKING ───────────────────────────────────────────────────

function trackActiveBlock(ed: Editor) {
  const container = editorContainer.value
  if (!container) {
    activeBlockRect.value = null
    return
  }

  const { $from } = ed.state.selection

  let blockDepth = 0
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d - 1).type.name === 'doc') {
      blockDepth = d
      break
    }
  }

  if (blockDepth === 0) {
    activeBlockRect.value = null
    activeBlockIndex.value = -1
    return
  }

  const blockStart = $from.before(blockDepth)

  // Determine block index
  let blockIndex = -1
  ed.state.doc.forEach((node, offset, index) => {
    if (blockStart >= offset && blockStart < offset + node.nodeSize) {
      blockIndex = index
    }
  })
  activeBlockIndex.value = blockIndex

  if (blockIndex < 0) {
    activeBlockRect.value = null
    return
  }

  const containerRect = container.getBoundingClientRect()
  const blockRect = getTopLevelBlockRect(blockIndex)
  if (!blockRect) {
    activeBlockRect.value = null
    return
  }

  activeBlockRect.value = {
    top: blockRect.top - containerRect.top,
    height: Math.max(blockRect.height, 28)
  }

  computeDropIndicators(containerRect)
}

function computeDropIndicators(containerRect: DOMRect) {
  const indicators: Array<{ index: number; top: number }> = []
  const blockElements = getTopLevelBlockElements()

  blockElements.forEach((element, index) => {
    const rect = element.getBoundingClientRect()
    indicators.push({ index, top: rect.top - containerRect.top })
  })

  const lastElement = blockElements[blockElements.length - 1]
  if (lastElement) {
    const lastRect = lastElement.getBoundingClientRect()
    indicators.push({ index: blockElements.length, top: lastRect.bottom - containerRect.top + 4 })
  }

  dropIndicators.value = indicators
}

function getTopLevelBlockElements() {
  const root = editorContainer.value?.querySelector('.ProseMirror')
  return Array.from(root?.children ?? []) as HTMLElement[]
}

function getTopLevelBlockRect(index: number) {
  const element = getTopLevelBlockElements()[index]
  return element?.getBoundingClientRect() ?? null
}

// ─── + BUTTON (ADD BLOCK AFTER CURRENT) ─────────────────────────────────────

function addBlockAfterCurrent() {
  const ed = editor.value
  if (!ed) {
    debugEditor('Cannot open inserter because the editor is not ready.')
    return
  }

  const fallbackIndex = Math.max(0, ed.state.doc.childCount - 1)
  insertAfterIndex.value = activeBlockIndex.value >= 0 ? activeBlockIndex.value : fallbackIndex
  inserterOpen.value = true
}

function closeInserter() {
  inserterOpen.value = false
}

function handleInserterPick(name: string) {
  closeInserter()
  insertBlockAtIndex(name, insertAfterIndex.value + 1)
}

// ─── SLASH COMMAND ───────────────────────────────────────────────────────────

function isAtBlockStart(view: EditorView, from: number) {
  const resolved = view.state.doc.resolve(from)
  return resolved.parent.type.name === 'paragraph' && resolved.parentOffset === 0
}

function openSlashMenu(view: EditorView, from: number) {
  const coords = view.coordsAtPos(from)
  slashPosition.value = {
    top: coords.bottom + 8,
    left: Math.min(coords.left, window.innerWidth - 304)
  }
  slashRange.value = { from, to: from + 1 }
  slashQuery.value = ''
  slashSelectedIndex.value = 0
  slashOpen.value = true
}

function refreshSlashQuery(ed: Editor) {
  if (!slashOpen.value || !slashRange.value) return

  const cursor = ed.state.selection.from
  if (cursor < slashRange.value.from) {
    closeSlashMenu()
    return
  }

  const text = ed.state.doc.textBetween(slashRange.value.from, cursor, '\n', '\n')
  if (!text.startsWith('/')) {
    closeSlashMenu()
    return
  }

  slashQuery.value = text.slice(1)
}

function closeSlashMenu() {
  slashOpen.value = false
  slashQuery.value = ''
  slashRange.value = null
  slashSelectedIndex.value = 0
}

function handleSlashPick(name: string) {
  const ed = editor.value
  if (!ed || !slashRange.value) return

  const from = slashRange.value.from
  const to = ed.state.selection.from
  closeSlashMenu()

  // Delete the typed "/query" text
  ed.chain().focus().deleteRange({ from, to }).run()

  // Check if current paragraph is now empty
  const { $from } = ed.state.selection
  const blockStart = $from.before($from.depth)
  const blockEnd = $from.after($from.depth)
  const isEmptyParagraph = $from.parent.type.name === 'paragraph' && $from.parent.textContent.length === 0

  if (isEmptyParagraph) {
    insertBlockReplacingRange(name, { from: blockStart, to: blockEnd })
  } else {
    insertBlockAtPosition(name, blockEnd)
  }
}

// ─── BLOCK INSERTION ─────────────────────────────────────────────────────────

function insertBlockAtIndex(name: string, targetIndex: number) {
  const ed = editor.value
  if (!ed) return

  let pos = ed.state.doc.content.size
  ed.state.doc.forEach((node, offset, index) => {
    if (index < targetIndex) {
      pos = offset + node.nodeSize
    }
  })

  insertBlockAtPosition(name, Math.min(pos, ed.state.doc.content.size))
}

function insertBlockAtPosition(name: string, pos: number) {
  const ed = editor.value
  if (!ed) return

  const safePos = Math.max(0, Math.min(pos, ed.state.doc.content.size))

  if (name === 'image') {
    pendingImageInsertPos.value = safePos
    imageInput.value?.click()
    return
  }

  if (name === 'table') {
    ed.chain().focus().insertContentAt(safePos, createTableContent()).run()
    return
  }

  if (name === 'horizontalRule') {
    ed.chain().focus().insertContentAt(safePos, { type: 'horizontalRule' }).run()
    return
  }

  if (name === 'wikiLink') {
    insertWikiLinkAtPosition(safePos)
    return
  }

  const definition = blockRegistry.getBlockDefinition(name)
  const content = definition?.createContent?.()
  if (!content) {
    debugEditor(`No block content factory for "${name}".`)
    return
  }

  ed.chain().focus().insertContentAt(safePos, content).run()
}

function insertBlockReplacingRange(name: string, range: { from: number; to: number }) {
  const ed = editor.value
  if (!ed) return

  if (name === 'image') {
    pendingImageInsertPos.value = range.from
    ed.chain().focus().deleteRange(range).run()
    imageInput.value?.click()
    return
  }

  if (name === 'table') {
    ed.chain().focus().deleteRange(range).insertContent(createTableContent()).run()
    return
  }

  if (name === 'horizontalRule') {
    ed.chain().focus().deleteRange(range).insertContent({ type: 'horizontalRule' }).run()
    return
  }

  if (name === 'wikiLink') {
    insertWikiLinkReplacingRange(range)
    return
  }

  const definition = blockRegistry.getBlockDefinition(name)
  const content = definition?.createContent?.()
  if (!content) {
    debugEditor(`No block content factory for "${name}".`)
    return
  }

  ed.chain().focus().deleteRange(range).insertContent(content).run()
}

// ─── DRAG AND DROP ───────────────────────────────────────────────────────────

function onBlockDragStart(event: DragEvent) {
  const idx = activeBlockIndex.value
  if (idx < 0) return
  draggingIndex.value = idx
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(idx))
  }
}

function onBlockDragEnd() {
  draggingIndex.value = null
  dragOverIndex.value = null
}

function onBlockDrop(targetIndex: number) {
  const sourceIndex = draggingIndex.value
  draggingIndex.value = null
  dragOverIndex.value = null

  if (sourceIndex === null || sourceIndex === targetIndex || sourceIndex === targetIndex - 1) return

  const ed = editor.value
  if (!ed) return

  const content = [...(ed.getJSON().content ?? [])]
  if (sourceIndex < 0 || sourceIndex >= content.length) return

  const [moved] = content.splice(sourceIndex, 1)
  if (!moved) return

  const adjustedTarget = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex
  content.splice(adjustedTarget, 0, moved)

  ed.commands.setContent({ type: 'doc', content }, false)
  emit('update:modelValue', ed.getJSON() as JsonContent)

  nextTick(() => {
    if (!editor.value) return
    const newPos = resolveBlockPosition(editor.value, adjustedTarget)
    editor.value.chain().focus().setTextSelection(newPos).run()
  })
}

function resolveBlockPosition(ed: Editor, index: number) {
  let pos = 1
  ed.state.doc.forEach((node, _offset, i) => {
    if (i < index) pos += node.nodeSize
  })
  return Math.min(pos, ed.state.doc.content.size)
}

// ─── UTILITY ─────────────────────────────────────────────────────────────────

function insertWikiLink() {
  const label = window.prompt('Wiki link label')?.trim()
  if (!label) return
  const target = normalizeWikiTarget(label)
  if (!target) return
  editor.value?.chain().focus().insertContent({
    type: 'wikiLink',
    attrs: { target, label }
  }).insertContent(' ').run()
}

function insertWikiLinkAtPosition(pos: number) {
  const label = window.prompt('Wiki link label')?.trim()
  if (!label) return
  const target = normalizeWikiTarget(label)
  if (!target) return
  editor.value?.chain().focus().insertContentAt(pos, {
    type: 'paragraph',
    content: [
      { type: 'wikiLink', attrs: { target, label } },
      { type: 'text', text: ' ' }
    ]
  }).run()
}

function insertWikiLinkReplacingRange(range: { from: number; to: number }) {
  const label = window.prompt('Wiki link label')?.trim()
  if (!label) return
  const target = normalizeWikiTarget(label)
  if (!target) return
  editor.value?.chain().focus().deleteRange(range).insertContent({
    type: 'paragraph',
    content: [
      { type: 'wikiLink', attrs: { target, label } },
      { type: 'text', text: ' ' }
    ]
  }).run()
}

function createTableContent(): JsonContent {
  return {
    type: 'table',
    content: Array.from({ length: 3 }, (_row, rowIndex) => ({
      type: 'tableRow',
      content: Array.from({ length: 3 }, () => ({
        type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph', content: [] }]
      }))
    }))
  }
}

function handlePickedImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void uploadImage(file)
  input.value = ''
}

function uploadImagesFromList(fileList: FileList | undefined | null) {
  const files = [...(fileList ?? [])].filter((f) => f.type.startsWith('image/'))
  if (!files.length) return false
  files.forEach((f) => void uploadImage(f))
  return true
}

async function uploadImage(file: File) {
  try {
    const formData = new FormData()
    formData.append('file', file)
    const asset = await $fetch<{ url: string }>('/api/admin/upload', {
      method: 'POST',
      body: formData
    })
    if (asset.url) {
      const ed = editor.value
      const insertPos = pendingImageInsertPos.value
      if (ed && insertPos !== null) {
        ed.chain().focus().insertContentAt(insertPos, {
          type: 'image',
          attrs: { src: asset.url, alt: file.name }
        }).run()
      } else {
        ed?.chain().focus().setImage({ src: asset.url, alt: file.name }).run()
      }
    }
  } catch {
    debugEditor('Image upload failed.')
  } finally {
    pendingImageInsertPos.value = null
  }
}

function debugEditor(message: string) {
  if (import.meta.dev) {
    console.warn(`[BlockEditor] ${message}`)
  }
}

function syncSelectedBlock(ed: Editor) {
  const { $from } = ed.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth - 1).type.name === 'doc') {
      const node = $from.node(depth)
      const pos = $from.before(depth)
      editorStore.selectBlock({
        id: `${node.type.name}:${pos}`,
        type: node.type.name,
        attrs: node.attrs,
        pos
      })
      return
    }
  }
  editorStore.selectBlock(null)
}
</script>

<style scoped>
:deep(.pandablog-block-editor .ProseMirror) {
  color: rgb(41 37 36);
  padding: 0.5rem 0;
}

:deep(.pandablog-block-editor .ProseMirror > *) {
  position: relative;
  margin-bottom: 0.75rem;
  border-radius: 0.25rem;
  transition: outline-color 0.15s;
  outline: 2px solid transparent;
  outline-offset: 6px;
}

:deep(.pandablog-block-editor .ProseMirror > .ProseMirror-selectednode),
:deep(.pandablog-block-editor .ProseMirror > *:hover) {
  outline-color: rgb(204 251 241);
}

:deep(.pandablog-block-editor .ProseMirror p) {
  min-height: 1.75rem;
  line-height: 1.8;
}

:deep(.pandablog-block-editor .ProseMirror h1) {
  font-size: 2.25rem;
  line-height: 1.15;
  font-weight: 700;
}

:deep(.pandablog-block-editor .ProseMirror h2) {
  font-size: 1.875rem;
  line-height: 1.2;
  font-weight: 700;
}

:deep(.pandablog-block-editor .ProseMirror h3) {
  font-size: 1.5rem;
  line-height: 1.3;
  font-weight: 650;
}

:deep(.pandablog-block-editor .ProseMirror h4),
:deep(.pandablog-block-editor .ProseMirror h5),
:deep(.pandablog-block-editor .ProseMirror h6) {
  font-size: 1.25rem;
  line-height: 1.35;
  font-weight: 650;
}

:deep(.pandablog-block-editor .ProseMirror ul) {
  list-style: disc;
  padding-left: 1.5rem;
}

:deep(.pandablog-block-editor .ProseMirror ol) {
  list-style: decimal;
  padding-left: 1.5rem;
}

:deep(.pandablog-block-editor .ProseMirror blockquote) {
  border-left: 4px solid rgb(13 148 136);
  color: rgb(68 64 60);
  padding-left: 1rem;
}

:deep(.pandablog-block-editor .ProseMirror pre) {
  overflow-x: auto;
  border-radius: 0.5rem;
  background: rgb(28 25 23);
  color: rgb(245 245 244);
  padding: 1rem;
}

:deep(.pandablog-block-editor .ProseMirror img) {
  max-width: 100%;
  border-radius: 0.5rem;
}

:deep(.pandablog-block-editor .ProseMirror table) {
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 0.5rem;
}

:deep(.pandablog-block-editor .ProseMirror th),
:deep(.pandablog-block-editor .ProseMirror td) {
  min-width: 6rem;
  border: 1px solid rgb(231 229 228);
  padding: 0.5rem;
  vertical-align: top;
}

:deep(.pandablog-block-editor .ProseMirror th) {
  background: rgb(245 245 244);
  font-weight: 650;
}

:deep(.pandablog-block-editor .ProseMirror .column-resize-handle) {
  bottom: -2px;
  position: absolute;
  right: -2px;
  top: 0;
  width: 4px;
  background-color: rgb(20 184 166);
  pointer-events: none;
}
</style>
