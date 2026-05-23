<template>
  <div ref="editorContainer" class="block-editor-root relative" data-testid="block-editor" @dragover="autoScroll.updatePointer" @click="onRootClick">
    <ClientOnly>
      <div class="relative">
        <InlineToolbar v-if="editor" :editor="editor" />

        <EditorContent v-if="editor" :editor="editor" class="pandablog-block-editor tiptap-editor" />

        <!-- Block popup toolbar (transform, drag, move, align, more) -->
        <BlockPopupToolbar
          v-if="editor"
          :editor="editor"
          :reference-el="actionsMenuReferenceEl"
          :visible="actionsMenuVisible"
          :block-type="editorStore.selectedBlockType"
          @move-up="runMoveUp"
          @move-down="runMoveDown"
          @duplicate="runDuplicate"
          @delete="runDelete"
          @transform="runTransform"
          @dragstart="onBlockDragStart"
          @dragend="onBlockDragEnd"
        />

        <!-- Per-block + button shown on the active block -->
        <div
          v-if="activeBlockRect && activeBlockIndex >= 0"
          class="pointer-events-none absolute left-0 right-0"
          :style="{ top: `${activeBlockRect.top}px`, height: `${activeBlockRect.height}px` }"
        >
          <button
            ref="dragHandleRef"
            type="button"
            draggable="true"
            class="drag-handle drag-handle-visible pointer-events-auto absolute -left-10 top-1"
            title="Drag block"
            aria-label="Drag block"
            data-testid="block-drag-handle"
            @click.stop.prevent="onHandleClick"
            @dragstart="onBlockDragStart"
            @dragend="onBlockDragEnd"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              class="pointer-events-none"
            >
              <circle cx="6" cy="4" r="1.5" fill="currentColor" />
              <circle cx="10" cy="4" r="1.5" fill="currentColor" />
              <circle cx="6" cy="8" r="1.5" fill="currentColor" />
              <circle cx="10" cy="8" r="1.5" fill="currentColor" />
              <circle cx="6" cy="12" r="1.5" fill="currentColor" />
              <circle cx="10" cy="12" r="1.5" fill="currentColor" />
            </svg>
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

        <!-- Block inserter panel (rendered inline by parent when 3-col layout is active) -->
        <BlockInserterPanel
          v-if="!useInlineInserter"
          :open="inserterOpen"
          @close="closeInserter"
          @insert="handleInserterPick"
        />

        <MediaPicker
          :open="mediaPickerOpen"
          return-value="url"
          type-filter="image"
          @update:open="setMediaPickerOpen"
          @select="handleMediaPicked"
        />

        <MediaPicker
          :open="mediaTextPickerOpen"
          return-value="url"
          type-filter="all"
          @update:open="setMediaTextPickerOpen"
          @select="handleMediaTextPicked"
        />

        <RelatedPostPicker
          v-model="relatedPostPickerOpen"
          @confirm="onRelatedPostSelect"
        />
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
import Color from '@tiptap/extension-color'
import Dropcursor from '@tiptap/extension-dropcursor'
import FontFamily from '@tiptap/extension-font-family'
import GapCursor from '@tiptap/extension-gapcursor'
import Highlight from '@tiptap/extension-highlight'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import type { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import '~/assets/css/editor-craft.css'
import '~/assets/css/code-themes.css'
import type { EditorView } from '@tiptap/pm/view'
import { all, createLowlight } from 'lowlight'
import type { JsonContent, MediaRecord } from '~/types/content'
import { MermaidNode } from '~/extensions/mermaid'
import { BlockReorderCommands } from '~/extensions/BlockReorderCommands'
import { RelatedPostNode } from '~/extensions/relatedPost'
import { CodeBlockEnhanced } from '~/extensions/codeBlockEnhanced'
import { CustomHtmlNode } from '~/extensions/customHtml'
import { ImageBlockNode } from '~/extensions/imageBlock'
import { MediaTextNode } from '~/extensions/mediaText'
import MermaidNodeView from '~/components/admin/editor/MermaidNodeView.vue'
import RelatedPostNodeView from '~/components/admin/editor/RelatedPostNodeView.vue'
import CodeBlockNodeView from '~/components/admin/editor/CodeBlockNodeView.vue'
import CustomHtmlNodeView from '~/components/admin/editor/CustomHtmlNodeView.vue'
import ImageBlockNodeView from '~/components/admin/editor/ImageBlockNodeView.vue'
import MediaTextNodeView from '~/components/admin/editor/MediaTextNodeView.vue'
// Explicit imports: Nuxt registers nested components with a path prefix
// (e.g. `AdminEditorBlockInserterPanel`), so the short tag names used below
// would not auto-resolve. Importing them directly guarantees they render.
import InlineToolbar from '~/components/admin/editor/InlineToolbar.vue'
import SlashCommandMenu from '~/components/admin/editor/SlashCommandMenu.vue'
import BlockInserterPanel from '~/components/admin/editor/blocks/BlockInserterPanel.vue'
import BlockPopupToolbar from '~/components/admin/editor/BlockPopupToolbar.vue'
import MediaPicker from '~/components/admin/media/MediaPicker.vue'
import RelatedPostPicker from '~/components/admin/editor/RelatedPostPicker.vue'
import { useAutoScroll } from '~/composables/editor/useAutoScroll'

const props = defineProps<{
  modelValue: JsonContent
  useInlineInserter?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: JsonContent]
}>()

const lowlight = createLowlight(all)
const editorStore = useEditorStore()
const blockRegistry = useBlockRegistry()
const editorContainer = ref<HTMLElement | null>(null)
const mediaPickerOpen = ref(false)
const mediaTextPickerOpen = ref(false)
const mediaTextTargetPos = ref<number | null>(null)
const relatedPostPickerOpen = ref(false)
const relatedPostMode = ref<'inline' | 'at' | 'replace'>('inline')
const relatedPostPendingPos = ref<number | null>(null)
const relatedPostPendingRange = ref<{ from: number; to: number } | null>(null)
let lastCtrlAStamp = 0

// Active block tracking (for + button and drag handle placement)
const activeBlockRect = ref<{ top: number; height: number } | null>(null)
const activeBlockIndex = ref<number>(-1)

// Drag and drop state
const draggingIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const dropIndicators = ref<Array<{ index: number; top: number }>>([])

// Auto-scroll during drag
const autoScroll = useAutoScroll()

// Block actions menu state
const actionsMenuVisible = ref(false)
const actionsMenuReferenceEl = ref<HTMLElement | null>(null)
const dragHandleRef = ref<HTMLElement | null>(null)

watch([activeBlockIndex, dragHandleRef], () => {
  if (activeBlockIndex.value >= 0 && dragHandleRef.value) {
    actionsMenuReferenceEl.value = dragHandleRef.value
    actionsMenuVisible.value = true
  } else {
    actionsMenuVisible.value = false
  }
})

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

// Inserter state (also mirrored to editorStore so parent layout can switch to 3-column mode)
const inserterOpen = ref(false)
const insertAfterIndex = ref<number>(-1)
const pendingImageInsertPos = ref<number | null>(null)

watch(inserterOpen, (open) => {
  if (open) editorStore.openInserter()
  else editorStore.closeInserter()
})

watch(() => editorStore.inserterOpen, (open) => {
  if (open !== inserterOpen.value) inserterOpen.value = open
})
let trackFrame: number | null = null
let draggedBlockElement: HTMLElement | null = null

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
    GapCursor,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    FontFamily,
    HorizontalRule,
    Dropcursor.configure({ color: '#0f766e', width: 2 }),
    CodeBlockEnhanced.configure({
      lowlight,
      defaultLanguage: 'text'
    }).extend({
      addNodeView() {
        return VueNodeViewRenderer(CodeBlockNodeView)
      }
    }),
    CustomHtmlNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(CustomHtmlNodeView)
      }
    }),
    ImageBlockNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(ImageBlockNodeView)
      }
    }),
    MediaTextNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(MediaTextNodeView)
      }
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
      includeChildren: true,
      showOnlyCurrent: false,
      placeholder: ({ node }) => {
        switch (node.type.name) {
          case 'heading': {
            const level = Number((node.attrs as { level?: number }).level ?? 1)
            return `Heading ${level}`
          }
          case 'blockquote': return 'Quote'
          case 'codeBlock': return 'Code'
          case 'bulletList':
          case 'orderedList':
          case 'listItem': return 'List item'
          case 'paragraph': return 'Type / to choose a block, or just start writing'
          default: return ''
        }
      }
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
    // RelatedPost: same shape as the removed wikiLink node, but with a Vue NodeView and no input rule.
    RelatedPostNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(RelatedPostNodeView)
      }
    }),
    BlockReorderCommands
  ],
  editorProps: {
    attributes: {
      class: 'min-h-[360px] focus:outline-none'
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
    handleKeyDown(view, event) {
      // Ctrl/Cmd + A: first press selects current block, second within 400ms selects whole doc.
      if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
        const now = Date.now()
        const isDouble = now - lastCtrlAStamp < 400
        lastCtrlAStamp = now
        const state = view.state
        if (isDouble) {
          // Select everything
          const tr = state.tr.setSelection(TextSelection.create(state.doc, 0, state.doc.content.size))
          view.dispatch(tr)
          event.preventDefault()
          return true
        }
        // Select inside current top-level block only
        const { $from } = state.selection
        let blockDepth = 0
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d - 1).type.name === 'doc') { blockDepth = d; break }
        }
        if (blockDepth > 0) {
          const start = $from.start(blockDepth)
          const end = $from.end(blockDepth)
          const tr = state.tr.setSelection(TextSelection.create(state.doc, start, end))
          view.dispatch(tr)
          event.preventDefault()
          return true
        }
        return false
      }

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
  onBlur({ event }) {
    // If focus moved into our own popup toolbar / pickers, keep the active block visible
    const next = event?.relatedTarget as HTMLElement | null
    if (next && (
      next.closest('[data-testid="block-popup-toolbar"]')
      || next.closest('[data-testid="block-drag-handle"]')
      || next.closest('[role="menu"]')
      || next.closest('[data-floating-ui-portal]')
    )) {
      return
    }
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

defineExpose({ editor, openInserter: () => { inserterOpen.value = true }, closeInserter, pickBlock: handleInserterPick })

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
  editorContainer.value?.addEventListener('mediatext-pick', onMediaTextPickEvent as EventListener)
  if (editor.value) {
    scheduleTrackActiveBlock(editor.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleViewportChange, true)
  window.removeEventListener('resize', handleViewportChange)
  editorContainer.value?.removeEventListener('mediatext-pick', onMediaTextPickEvent as EventListener)
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

// ─── BLOCK POPUP TOOLBAR HANDLERS ─────────────────────────────────────────

function runMoveUp() {
  editor.value?.commands.moveBlockUp?.()
  actionsMenuVisible.value = false
}

function runMoveDown() {
  editor.value?.commands.moveBlockDown?.()
  actionsMenuVisible.value = false
}

function runDuplicate() {
  const ed = editor.value
  if (!ed) return
  const { $from } = ed.state.selection
  let blockDepth = 0
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d - 1).type.name === 'doc') { blockDepth = d; break }
  }
  if (blockDepth === 0) return
  const blockStart = $from.before(blockDepth)
  const blockEnd = $from.after(blockDepth)
  const slice = ed.state.doc.slice(blockStart, blockEnd)
  ed.chain().focus().insertContentAt(blockEnd, slice.content.toJSON()).run()
  actionsMenuVisible.value = false
}

function runDelete() {
  const ed = editor.value
  if (!ed) return
  const { $from } = ed.state.selection
  let blockDepth = 0
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d - 1).type.name === 'doc') { blockDepth = d; break }
  }
  if (blockDepth === 0) return
  const blockStart = $from.before(blockDepth)
  const blockEnd = $from.after(blockDepth)
  ed.chain().focus().deleteRange({ from: blockStart, to: blockEnd }).run()
  actionsMenuVisible.value = false
}

function runTransform(target: string) {
  const ed = editor.value
  if (!ed) return
  const chain = ed.chain().focus()
  switch (target) {
    case 'paragraph': chain.setParagraph().run(); break
    case 'heading-1': chain.setHeading({ level: 1 }).run(); break
    case 'heading-2': chain.setHeading({ level: 2 }).run(); break
    case 'heading-3': chain.setHeading({ level: 3 }).run(); break
    case 'bulletList': chain.toggleBulletList().run(); break
    case 'orderedList': chain.toggleOrderedList().run(); break
    case 'blockquote': chain.toggleBlockquote().run(); break
    case 'codeBlock': chain.toggleCodeBlock().run(); break
  }
  actionsMenuVisible.value = false
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
    mediaPickerOpen.value = true
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

  if (name === 'relatedPost') {
    insertRelatedPostAtPosition(safePos)
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
    mediaPickerOpen.value = true
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

  if (name === 'relatedPost') {
    insertRelatedPostReplacingRange(range)
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

/**
 * Called when handle is clicked (not dragged). Opens the block actions menu.
 */
function onHandleClick(event: MouseEvent) {
  actionsMenuReferenceEl.value = event.currentTarget as HTMLElement
  actionsMenuVisible.value = !actionsMenuVisible.value
}

function onBlockDragStart(event: DragEvent) {
  const idx = activeBlockIndex.value
  if (idx < 0) return

  actionsMenuVisible.value = false
  draggingIndex.value = idx

  const blockElement = getTopLevelBlockElements()[idx]
  draggedBlockElement = blockElement ?? null
  if (draggedBlockElement) {
    draggedBlockElement.dataset.dragging = 'true'
  }

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(idx))
    if (blockElement) {
      event.dataTransfer.setDragImage(blockElement, 24, Math.min(24, Math.max(12, blockElement.clientHeight / 2)))
    }
  }

  autoScroll.updatePointer(event)
  autoScroll.start()
}

function onBlockDragEnd() {
  clearDraggedBlockState()
  autoScroll.stop()
  draggingIndex.value = null
  dragOverIndex.value = null
}

function onBlockDrop(targetIndex: number) {
  const sourceIndex = draggingIndex.value
  clearDraggedBlockState()
  autoScroll.stop()
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
    animateDroppedBlock(adjustedTarget)
  })
}

function resolveBlockPosition(ed: Editor, index: number) {
  let pos = 1
  ed.state.doc.forEach((node, _offset, i) => {
    if (i < index) pos += node.nodeSize
  })
  return Math.min(pos, ed.state.doc.content.size)
}

function clearDraggedBlockState() {
  if (!draggedBlockElement) return
  delete draggedBlockElement.dataset.dragging
  draggedBlockElement = null
}

function animateDroppedBlock(index: number) {
  const element = getTopLevelBlockElements()[index]
  if (!element) return

  element.classList.remove('just-dropped')
  void element.offsetWidth
  element.classList.add('just-dropped')
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  window.setTimeout(() => {
    element.classList.remove('just-dropped')
  }, 400)
}

// ─── UTILITY ─────────────────────────────────────────────────────────────────

function insertRelatedPost() {
  relatedPostMode.value = 'inline'
  relatedPostPendingPos.value = null
  relatedPostPendingRange.value = null
  relatedPostPickerOpen.value = true
}

function insertRelatedPostAtPosition(pos: number) {
  relatedPostMode.value = 'at'
  relatedPostPendingPos.value = pos
  relatedPostPendingRange.value = null
  relatedPostPickerOpen.value = true
}

function insertRelatedPostReplacingRange(range: { from: number; to: number }) {
  relatedPostMode.value = 'replace'
  relatedPostPendingPos.value = null
  relatedPostPendingRange.value = range
  relatedPostPickerOpen.value = true
}

function onRelatedPostSelect(item: { label: string; target: string }) {
  const ed = editor.value
  if (!ed) return
  const target = (item.target || '').trim()
  const label = (item.label || '').trim() || target
  if (!target) return
  if (relatedPostMode.value === 'inline') {
    ed.chain().focus().insertContent({
      type: 'relatedPost',
      attrs: { target, label }
    }).insertContent(' ').run()
  } else if (relatedPostMode.value === 'at' && relatedPostPendingPos.value !== null) {
    ed.chain().focus().insertContentAt(relatedPostPendingPos.value, {
      type: 'paragraph',
      content: [
        { type: 'relatedPost', attrs: { target, label } },
        { type: 'text', text: ' ' }
      ]
    }).run()
  } else if (relatedPostMode.value === 'replace' && relatedPostPendingRange.value) {
    ed.chain().focus().deleteRange(relatedPostPendingRange.value).insertContent({
      type: 'paragraph',
      content: [
        { type: 'relatedPost', attrs: { target, label } },
        { type: 'text', text: ' ' }
      ]
    }).run()
  }
  relatedPostPendingPos.value = null
  relatedPostPendingRange.value = null
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

function uploadImagesFromList(fileList: FileList | undefined | null) {
  const files = [...(fileList ?? [])].filter((f) => f.type.startsWith('image/'))
  if (!files.length) return false
  files.forEach((f) => void uploadImage(f))
  return true
}

function handleMediaPicked(files: MediaRecord[]) {
  const ed = editor.value
  if (!ed) return

  const insertPos = pendingImageInsertPos.value
  const content = files.map((file) => ({
    type: 'image',
    attrs: { src: file.url, alt: file.original_name }
  }))

  if (insertPos !== null) {
    ed.chain().focus().insertContentAt(insertPos, content).run()
  } else {
    for (const node of content) {
      ed.chain().focus().setImage(node.attrs).run()
    }
  }

  pendingImageInsertPos.value = null
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

function setMediaPickerOpen(value: boolean) {
  mediaPickerOpen.value = value
  if (!value) {
    pendingImageInsertPos.value = null
  }
}

// ─── MEDIA + TEXT PICKER FLOW ────────────────────────────────────────────────

function setMediaTextPickerOpen(value: boolean) {
  mediaTextPickerOpen.value = value
  if (!value) mediaTextTargetPos.value = null
}

function onMediaTextPickEvent(event: Event) {
  const e = event as CustomEvent<{ source: 'library' | 'upload' | 'url'; nodePos: number | null }>
  const detail = e.detail
  if (!detail) return
  mediaTextTargetPos.value = detail.nodePos
  if (detail.source === 'library') {
    mediaTextPickerOpen.value = true
  } else if (detail.source === 'upload') {
    triggerLocalFileUploadForMediaText()
  } else if (detail.source === 'url') {
    promptRemoteUrlForMediaText()
  }
}

function handleMediaTextPicked(files: MediaRecord[]) {
  const ed = editor.value
  const pos = mediaTextTargetPos.value
  const file = files[0]
  if (!ed || pos === null || !file) {
    setMediaTextPickerOpen(false)
    return
  }
  ed.chain().focus().command(({ tr }) => {
    const node = tr.doc.nodeAt(pos)
    if (!node || node.type.name !== 'mediaText') return false
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      mediaSrc: file.url,
      mediaAlt: file.original_name ?? '',
      mediaName: file.original_name ?? '',
      mediaMime: file.mime_type ?? '',
      mediaSize: typeof file.size === 'number' ? file.size : null,
      mediaWidth: typeof file.width === 'number' ? file.width : null,
      mediaHeight: typeof file.height === 'number' ? file.height : null
    })
    return true
  }).run()
  setMediaTextPickerOpen(false)
}

function triggerLocalFileUploadForMediaText() {
  if (mediaTextTargetPos.value === null) return
  const input = document.createElement('input')
  input.type = 'file'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const formData = new FormData()
      formData.append('file', file)
      const asset = await $fetch<MediaRecord>('/api/admin/upload', { method: 'POST', body: formData })
      if (asset?.url) {
        handleMediaTextPicked([asset])
      }
    } catch {
      debugEditor('Media+Text upload failed.')
    }
  }
  input.click()
}

function promptRemoteUrlForMediaText() {
  const url = window.prompt('Remote media URL')?.trim()
  if (!url) return
  // Best-effort fake MediaRecord shape so handleMediaTextPicked can apply it.
  const name = url.split('/').pop()?.split('?')[0] ?? url
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  const mimeGuess = (() => {
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`
    if (['mp4', 'webm', 'ogg'].includes(ext)) return `video/${ext}`
    if (['mp3', 'wav', 'flac'].includes(ext)) return `audio/${ext === 'mp3' ? 'mpeg' : ext}`
    if (ext === 'pdf') return 'application/pdf'
    return ''
  })()
  handleMediaTextPicked([{
    url,
    original_name: name,
    mime_type: mimeGuess
  } as unknown as MediaRecord])
}

// ─── CLICK EMPTY AREA TO ADD A NEW LINE ──────────────────────────────────────

function onRootClick(event: MouseEvent) {
  const ed = editor.value
  if (!ed) return
  const target = event.target as HTMLElement | null
  if (!target) return
  // Only act when click happened on the editor wrapper itself (not on any text/block content).
  if (target !== editorContainer.value && !target.classList.contains('block-editor-root')) {
    // Also accept clicks on the ProseMirror root itself but below the last child
    const root = editorContainer.value?.querySelector('.ProseMirror') as HTMLElement | null
    if (!root || target !== root) return
    const lastChild = root.lastElementChild as HTMLElement | null
    if (!lastChild) return
    const rect = lastChild.getBoundingClientRect()
    if (event.clientY < rect.bottom) return
  }
  const docSize = ed.state.doc.content.size
  // Avoid adding when last block is already an empty paragraph
  const last = ed.state.doc.lastChild
  if (last && last.type.name === 'paragraph' && last.content.size === 0) {
    ed.chain().focus().setTextSelection(docSize).run()
    return
  }
  ed.chain().focus().insertContentAt(docSize, { type: 'paragraph' }).run()
}

function debugEditor(message: string) {
  if (import.meta.dev) {
    console.warn(`[BlockEditor] ${message}`)
  }
}

function syncSelectedBlock(ed: Editor) {
  const sel = ed.state.selection
  // Handle atom node selections (image, customHtml, mermaid, etc.) which don't have a parent block depth.
  if (sel instanceof NodeSelection) {
    const node = sel.node
    const pos = sel.from
    editorStore.selectBlock({
      id: `${node.type.name}:${pos}`,
      type: node.type.name,
      attrs: node.attrs,
      pos
    })
    return
  }
  const { $from } = sel
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

/* Code block NodeView owns its own styling — do not override its inner <pre>. */
:deep(.pandablog-block-editor .ProseMirror .codeblock-nodeview pre) {
  background: transparent;
  color: inherit;
  padding: 0.75rem 1rem;
  border-radius: 0;
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
