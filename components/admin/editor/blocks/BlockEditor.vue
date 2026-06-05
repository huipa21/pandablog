<template>
  <div ref="editorContainer" class="block-editor-root relative" data-testid="block-editor" @dragover="autoScroll.updatePointer" @click="onRootClick" @customhtml-interact="onCustomHtmlInteract">
    <ClientOnly>
      <div class="relative">
        <div class="block-editor-grid">
          <div class="editor-gutter-col" aria-hidden="true" />
          <EditorContent v-if="editor" :editor="editor" class="pandablog-block-editor pb-prose editor-content-col" />
          <div class="editor-gutter-col" aria-hidden="true" />
        </div>

        <!-- Unified block toolbar (block actions + inline formatting when text selected) -->
        <BlockToolbar
          v-if="editor"
          :editor="editor"
          :reference-el="actionsMenuReferenceEl"
          :visible="actionsMenuVisible && !slashOpen"
          :block-type="editorStore.selectedBlockType"
          :has-text-selection="hasTextSelection"
          :selection-tick="selectionTick"
          :last-text-selection="lastTextSelection"
          @move-up="runMoveUp"
          @move-down="runMoveDown"
          @duplicate="runDuplicate"
          @delete="runDelete"
          @copy-block="runCopyBlock"
          @cut-block="runCutBlock"
          @add-before="runAddBefore"
          @add-after="runAddAfter"
          @edit-html="runEditHtml"
          @add-footnote="runAddFootnote"
          @transform="runTransform"
        />

        <!-- Per-block + button shown on the active block -->
        <div
          v-if="activeBlockRect && activeBlockRange"
          class="block-active-overlay pointer-events-none absolute inset-x-0"
          :style="{
            top: `${activeBlockRect.top}px`,
            height: `${activeBlockRect.height}px`
          }"
        >
          <button
            ref="dragHandleRef"
            type="button"
            :draggable="activeBlockRange?.parentDepth === 0"
            class="block-grid-handle pointer-events-auto col-start-1 justify-self-center"
            :title="activeBlockRange?.parentDepth === 0 ? 'Drag block' : 'Use toolbar actions to move nested block'"
            :aria-label="activeBlockRange?.parentDepth === 0 ? 'Drag block' : 'Nested block actions'"
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

          <!-- + button in the right gutter -->
          <button
            type="button"
            class="block-grid-add pointer-events-auto col-start-3 justify-self-center"
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

        <AdminPromptDialog
          :open="editHtmlDialogOpen"
          title="Edit HTML"
          description="Update the HTML for the selected block."
          label="HTML"
          :initial-value="editHtmlInitialValue"
          confirm-label="Apply HTML"
          :required="false"
          :trim="false"
          multiline
          :rows="12"
          @update:open="(value) => { if (!value) closeEditHtmlDialog() }"
          @cancel="closeEditHtmlDialog"
          @confirm="confirmEditHtml"
        />

        <AdminPromptDialog
          :open="embedUrlDialogOpen"
          title="Insert Embed"
          description="Paste a video, audio, or website URL to embed in the post."
          label="Embed URL"
          placeholder="https://example.com"
          :validate="validateEmbedUrlInput"
          confirm-label="Insert embed"
          @update:open="(value) => { if (!value) closeEmbedUrlDialog() }"
          @cancel="closeEmbedUrlDialog"
          @confirm="confirmEmbedUrl"
        />

        <AdminPromptDialog
          :open="mediaTextRemoteUrlDialogOpen"
          title="Remote Media URL"
          description="Use a remote image, video, audio, or document URL for this Media + Text block."
          label="Remote media URL"
          placeholder="https://example.com/media.jpg"
          input-type="url"
          confirm-label="Use URL"
          @update:open="(value) => { if (!value) closeRemoteMediaTextDialog() }"
          @cancel="closeRemoteMediaTextDialog"
          @confirm="confirmRemoteMediaTextUrl"
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
import { getMarkRange } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Color from '@tiptap/extension-color'
import Dropcursor from '@tiptap/extension-dropcursor'
import FontFamily from '@tiptap/extension-font-family'
import GapCursor from '@tiptap/extension-gapcursor'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import type { Editor } from '@tiptap/core'
import type { MarkType, Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import { Footnote } from '~/extensions/footnote'
import { generateFootnoteId } from '~/extensions/footnote'
import { FootnotesBlockNode } from '~/extensions/footnotesBlock'
import { LinkEnhanced } from '~/extensions/linkEnhanced'
import { ListItemEnhanced } from '~/extensions/listItemEnhanced'
import { SeparatorNode } from '~/extensions/separator'
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
import { DiffBlockNode } from '~/extensions/diffBlock'
import { BlockquoteEnhanced } from '~/extensions/blockquoteEnhanced'
import { CustomHtmlNode } from '~/extensions/customHtml'
import { ImageBlockNode } from '~/extensions/imageBlock'
import { MediaTextNode } from '~/extensions/mediaText'
import { ColumnItemNode, ColumnsBlockNode } from '~/extensions/columnsBlock'
import { TabPanelNode, TabsBlockNode } from '~/extensions/tabsBlock'
import MermaidNodeView from '~/components/admin/editor/MermaidNodeView.vue'
import RelatedPostNodeView from '~/components/admin/editor/RelatedPostNodeView.vue'
import CodeBlockNodeView from '~/components/admin/editor/CodeBlockNodeView.vue'
import DiffBlockNodeView from '~/components/admin/editor/DiffBlockNodeView.vue'
import CustomHtmlNodeView from '~/components/admin/editor/CustomHtmlNodeView.vue'
import ImageBlockNodeView from '~/components/admin/editor/ImageBlockNodeView.vue'
import MediaTextNodeView from '~/components/admin/editor/MediaTextNodeView.vue'
import ColumnsBlockNodeView from '~/components/admin/editor/ColumnsBlockNodeView.vue'
import ColumnItemNodeView from '~/components/admin/editor/ColumnItemNodeView.vue'
import TabsBlockNodeView from '~/components/admin/editor/TabsBlockNodeView.vue'
import TabPanelNodeView from '~/components/admin/editor/TabPanelNodeView.vue'
import QuoteBlockNodeView from '~/components/admin/editor/QuoteBlockNodeView.vue'
// Explicit imports: Nuxt registers nested components with a path prefix
// (e.g. `AdminEditorBlockInserterPanel`), so the short tag names used below
// would not auto-resolve. Importing them directly guarantees they render.
import SlashCommandMenu from '~/components/admin/editor/SlashCommandMenu.vue'
import BlockInserterPanel from '~/components/admin/editor/blocks/BlockInserterPanel.vue'
import BlockToolbar from '~/components/admin/editor/BlockToolbar.vue'
import MediaPicker from '~/components/admin/media/MediaPicker.vue'
import RelatedPostPicker from '~/components/admin/editor/RelatedPostPicker.vue'
import { useAutoScroll } from '~/composables/editor/useAutoScroll'
import { useMediaUrl } from '~/composables/useMediaUrl'

interface ActiveBlockRange {
  from: number
  to: number
  node: ProseMirrorNode
  depth: number
  parentDepth: number
  parentChildCount: number
  index: number
  topLevelIndex: number
}

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
const editHtmlDialogOpen = ref(false)
const editHtmlInitialValue = ref('')
const pendingEditHtml = ref<{ from: number; to: number; html: string } | null>(null)
const embedUrlDialogOpen = ref(false)
const pendingEmbedInsertPos = ref<number | null>(null)
const mediaTextRemoteUrlDialogOpen = ref(false)
let lastCtrlAStamp = 0

// Active block tracking (for + button and drag handle placement)
const activeBlockRect = ref<{ top: number; height: number } | null>(null)
const activeBlockIndex = ref<number>(-1)
const activeBlockRange = ref<ActiveBlockRange | null>(null)

// Drag and drop state
const draggingIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const dropIndicators = ref<Array<{ index: number; top: number }>>([])

// Auto-scroll during drag
const autoScroll = useAutoScroll()
const { toPublicMediaUrl, resolveMediaUrl } = useMediaUrl()

// Block actions menu state
const actionsMenuVisible = ref(false)
const actionsMenuReferenceEl = ref<HTMLElement | null>(null)
const dragHandleRef = ref<HTMLElement | null>(null)

// Text selection state for inline formatting.
// TipTap editor internals are not Vue-reactive, so keep this in a ref and
// update it from editor lifecycle callbacks.
const hasTextSelection = ref(false)
const selectionTick = ref(0)
const lastTextSelection = ref<{ from: number; to: number } | null>(null)
let syncingFootnotes = false

watch([activeBlockRange, dragHandleRef], () => {
  if (activeBlockRange.value && dragHandleRef.value) {
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
const SLASH_MENU_WIDTH = 288
const SLASH_MENU_MARGIN = 12
const SLASH_MENU_GAP = 8
const SLASH_MENU_HEADER_HEIGHT = 33
const SLASH_MENU_ITEM_HEIGHT = 44
const SLASH_MENU_EMPTY_HEIGHT = 52
const SLASH_MENU_MAX_HEIGHT = 448
const slashItems = computed(() => {
  const items = blockRegistry.searchBlocks(slashQuery.value)
  return items.filter((b) => b.implemented)
})
const ALLOWED_NESTED_BLOCK_CONTAINERS = new Set(['mediaText', 'columnsBlock', 'columnItem', 'tabsBlock', 'tabPanel'])
const NESTED_BLOCK_ROOT_TYPES = new Set(['columnItem', 'tabPanel'])

// Inserter state (also mirrored to editorStore so parent layout can switch to 3-column mode)
const inserterOpen = ref(false)
const insertAfterPos = ref<number | null>(null)
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
      listItem: false,
      blockquote: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      horizontalRule: false
    }),
    GapCursor,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    FontFamily,
    SeparatorNode,
    Dropcursor.configure({ color: 'var(--pb-primary)', width: 2 }),
    CodeBlockEnhanced.configure({
      lowlight,
      defaultLanguage: 'text'
    }).extend({
      addNodeView() {
        return VueNodeViewRenderer(CodeBlockNodeView)
      }
    }),
    DiffBlockNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(DiffBlockNodeView)
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
    ColumnsBlockNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(ColumnsBlockNodeView)
      }
    }),
    ColumnItemNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(ColumnItemNodeView)
      }
    }),
    TabsBlockNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(TabsBlockNodeView)
      }
    }),
    TabPanelNode.extend({
      addNodeView() {
        return VueNodeViewRenderer(TabPanelNodeView)
      }
    }),
    LinkEnhanced.configure({
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
          case 'codeBlock': return ''
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
    BlockReorderCommands,
    BlockquoteEnhanced.extend({
      addNodeView() {
        return VueNodeViewRenderer(QuoteBlockNodeView)
      }
    }),
    Subscript,
    Superscript,
    Footnote,
    ListItemEnhanced,
    FootnotesBlockNode
  ],
  editorProps: {
    attributes: {
      class: 'min-h-[360px] focus:outline-none'
    },
    handlePaste(view, event) {
      if (uploadImagesFromList(event.clipboardData?.files)) {
        return true
      }

      return pastePlainTextInsideTabPanel(view, event)
    },
    handleDrop(_view, event) {
      const handled = uploadImagesFromList(event.dataTransfer?.files)
      if (handled) event.preventDefault()
      return handled
    },
    handleClick(view, _pos, event) {
      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a[href^="#fn-"] , a[href^="#fnref-"]') as HTMLAnchorElement | null
      const footnoteSup = target?.closest('.footnote-ref') as HTMLElement | null

      if (!anchor && footnoteSup) {
        const id = String(footnoteSup.getAttribute('data-footnote-id') ?? '')
        const index = Number(footnoteSup.getAttribute('data-footnote-index') ?? id.replace('fn-', ''))
        if (Number.isFinite(index) && index > 0) {
          event.preventDefault()
          return jumpToFootnoteItem(view, index)
        }
      }

      if (!anchor) return false

      const href = anchor.getAttribute('href') ?? ''
      if (!href.startsWith('#')) return false

      event.preventDefault()
      const id = href.slice(1)

      if (id.startsWith('fnref-')) {
        const index = resolveFootnoteIndexFromAnchor(view, id, target, 'fnref-')
        if (Number.isFinite(index) && index > 0) {
          return jumpToFootnoteReference(view, index)
        }
        return false
      }

      if (id.startsWith('fn-')) {
        const index = resolveFootnoteIndexFromAnchor(view, id, target, 'fn-')
        if (Number.isFinite(index) && index > 0) {
          return jumpToFootnoteItem(view, index)
        }
      }

      return false
    },
    handleTextInput(view, from, _to, text) {
      if (text === '/' && isAtBlockStart(view, from)) {
        window.setTimeout(() => openSlashMenu(view, from), 0)
      }
      return false
    },
    handleKeyDown(view, event) {
      if (handleInlineMarkTabExit(view, event)) {
        return true
      }

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

        const nestedTextRange = getNestedTextOnlySelectionRange(state.selection.$from)
        if (nestedTextRange) {
          const tr = state.tr.setSelection(TextSelection.create(state.doc, nestedTextRange.from, nestedTextRange.to))
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

      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (handleProtectedFootnotesEnter(view)) {
          event.preventDefault()
          return true
        }
      }

      if (event.key === 'ArrowDown' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const { selection } = view.state
        if (selection instanceof NodeSelection) {
          const ed = editor.value
          if (!ed) return false
          const editableEnd = editableDocumentEndPos(ed)
          const trailingPara = findTopLevelBlockEndingAt(ed, editableEnd)
          if (
            trailingPara?.node.type.name === 'paragraph'
            && trailingPara.node.content.size === 0
            && selection.to === trailingPara.from
          ) {
            ed.chain().focus().setTextSelection(trailingPara.from + 1).run()
            event.preventDefault()
            return true
          }
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
        if (item) {
          handleSlashPick(item.name)
        } else {
          // No matching items — close menu and remove the slash text
          dismissSlashMenu()
        }
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
    if (ensureTrailingParagraph(ed)) {
      return
    }

    if (syncFootnotesConsistency(ed)) {
      return
    }

    updateSelectionState(ed)
    refreshSlashQuery(ed)
    scheduleTrackActiveBlock(ed)
    emit('update:modelValue', ed.getJSON() as JsonContent)
    syncSelectedBlock(ed)
  },
  onCreate({ editor: ed }) {
    ensureTrailingParagraph(ed)
    syncFootnotesConsistency(ed)
    updateSelectionState(ed)
  },
  onSelectionUpdate({ editor: ed }) {
    updateSelectionState(ed)
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
    hasTextSelection.value = false
    closeSlashMenu()
  },
  onFocus({ editor: ed }) {
    updateSelectionState(ed)
    scheduleTrackActiveBlock(ed)
  }
})

function handleInlineMarkTabExit(view: EditorView, event: KeyboardEvent) {
  if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
    return false
  }

  const { state } = view
  const activeMarkTypes = ['code', 'highlight']
    .map((name) => state.schema.marks[name])
    .filter((markType): markType is MarkType => !!markType && (state.storedMarks ?? state.selection.$from.marks()).some((mark) => mark.type === markType))

  if (!activeMarkTypes.length) {
    return false
  }

  let exitPos = state.selection.to
  for (const markType of activeMarkTypes) {
    const range = getMarkRange(state.selection.$from, markType)
    if (range) {
      exitPos = Math.max(exitPos, range.to)
    }
  }

  const safePos = Math.max(0, Math.min(exitPos, state.doc.content.size))
  const tr = state.tr
    .setSelection(TextSelection.create(state.doc, safePos))
    .setStoredMarks([])

  view.dispatch(tr)
  view.focus()
  event.preventDefault()
  return true
}

function updateSelectionState(ed: Editor) {
  const { selection } = ed.state
  hasTextSelection.value = !selection.empty && !ed.isActive('codeBlock')

  if (!selection.empty && selection.from !== selection.to && !ed.isActive('codeBlock')) {
    lastTextSelection.value = { from: selection.from, to: selection.to }
  }

  selectionTick.value += 1
}

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
    if (slashOpen.value && slashRange.value) {
      updateSlashMenuPosition(editor.value.view, slashRange.value.from)
    }
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
    activeBlockRange.value = null
    return
  }
  const range = getActiveBlockRangeFromSelection(ed)
  activeBlockRange.value = range

  if (!range) {
    activeBlockIndex.value = -1
    activeBlockRect.value = null
    return
  }

  if (range.node.type.name === 'footnotesBlock') {
    activeBlockIndex.value = -1
    activeBlockRect.value = null
    computeDropIndicators(container.getBoundingClientRect())
    return
  }

  activeBlockIndex.value = range.topLevelIndex

  if (range.topLevelIndex < 0) {
    activeBlockRect.value = null
    return
  }

  const containerRect = container.getBoundingClientRect()
  const blockRect = getBlockRectForRange(ed, range)
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
  if (lastElement && !lastElement.matches('[data-footnotes-block="true"], .footnotes-block')) {
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

function getBlockRectForRange(ed: Editor, range: ActiveBlockRange) {
  const dom = ed.view.nodeDOM(range.from)
  if (dom instanceof HTMLElement) {
    return dom.getBoundingClientRect()
  }

  if (dom instanceof Text) {
    return dom.parentElement?.getBoundingClientRect() ?? null
  }

  const from = Math.max(1, Math.min(range.from + 1, ed.state.doc.content.size))
  const to = Math.max(from, Math.min(range.to - 1, ed.state.doc.content.size))
  try {
    const start = ed.view.coordsAtPos(from)
    const end = ed.view.coordsAtPos(to)
    return new DOMRect(start.left, start.top, Math.max(end.right - start.left, 1), Math.max(end.bottom - start.top, 28))
  } catch {
    return getTopLevelBlockRect(range.topLevelIndex)
  }
}

// ─── + BUTTON (ADD BLOCK AFTER CURRENT) ─────────────────────────────────────

function addBlockAfterCurrent() {
  const ed = editor.value
  if (!ed) {
    debugEditor('Cannot open inserter because the editor is not ready.')
    return
  }

  insertAfterPos.value = activeBlockRange.value?.to ?? editableDocumentEndPos(ed)
  inserterOpen.value = true
}

function closeInserter() {
  inserterOpen.value = false
}

function handleInserterPick(name: string) {
  closeInserter()
  const ed = editor.value
  insertBlockAtPosition(name, insertAfterPos.value ?? (ed ? editableDocumentEndPos(ed) : 0))
  insertAfterPos.value = null
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
  const range = getActiveBlockRange()
  if (!range || range.node.type.name === 'footnotesBlock') return
  const slice = ed.state.doc.slice(range.from, range.to)
  ed.chain().focus().insertContentAt(normalizeStandaloneBlockInsertPos(ed, range.to), slice.content.toJSON()).run()
  actionsMenuVisible.value = false
}

function runDelete() {
  const ed = editor.value
  if (!ed) return
  const range = getActiveBlockRange()
  if (!range) return
  deleteActiveBlockRange(ed, range)
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
    case 'horizontalRule': chain.insertContent({ type: 'horizontalRule' }).run(); break
  }
  actionsMenuVisible.value = false
}

function getActiveBlockRange() {
  const ed = editor.value
  if (!ed) return null
  return getActiveBlockRangeFromSelection(ed) ?? activeBlockRange.value
}

function deleteActiveBlockRange(ed: Editor, range: ActiveBlockRange) {
  if (range.node.type.name === 'footnotesBlock') return false

  if (range.parentDepth > 0 && range.parentChildCount <= 1) {
    const paragraph = ed.schema.nodes.paragraph?.createAndFill()
    if (!paragraph) return false
    ed.chain().focus().insertContentAt({ from: range.from, to: range.to }, paragraph.toJSON()).run()
    return true
  }

  ed.chain().focus().deleteRange({ from: range.from, to: range.to }).run()
  return true
}

function runCopyBlock() {
  const ed = editor.value
  const range = getActiveBlockRange()
  if (!ed || !range) return
  const slice = ed.state.doc.slice(range.from, range.to)
  const text = slice.content.textBetween(0, slice.content.size, '\n')
  navigator.clipboard.writeText(text)
  actionsMenuVisible.value = false
}

function runCutBlock() {
  const ed = editor.value
  const range = getActiveBlockRange()
  if (!ed || !range) return
  if (range.node.type.name === 'footnotesBlock') return
  const slice = ed.state.doc.slice(range.from, range.to)
  const text = slice.content.textBetween(0, slice.content.size, '\n')
  navigator.clipboard.writeText(text)
  deleteActiveBlockRange(ed, range)
  actionsMenuVisible.value = false
}

function runAddBefore() {
  const ed = editor.value
  const range = getActiveBlockRange()
  if (!ed || !range) return
  ed.chain().focus().insertContentAt(normalizeStandaloneBlockInsertPos(ed, range.from, 'paragraph'), { type: 'paragraph' }).run()
  actionsMenuVisible.value = false
}

function runAddAfter() {
  const ed = editor.value
  const range = getActiveBlockRange()
  if (!ed || !range) return
  ed.chain().focus().insertContentAt(normalizeStandaloneBlockInsertPos(ed, range.to, 'paragraph'), { type: 'paragraph' }).run()
  actionsMenuVisible.value = false
}

function selectionIsInsideTopLevelNode(ed: Editor, typeName: string) {
  const range = getTopLevelBlockRange(ed)
  return range?.node.type.name === typeName
}

async function runEditHtml() {
  const ed = editor.value
  const range = getActiveBlockRange()
  if (!ed || !range) return
  const slice = ed.state.doc.slice(range.from, range.to)
  const div = document.createElement('div')
  const fragment = slice.content
  const { DOMSerializer } = await import('@tiptap/pm/model')
  const serializer = DOMSerializer.fromSchema(ed.schema)
  const dom = serializer.serializeFragment(fragment)
  div.appendChild(dom)
  const html = div.innerHTML
  editHtmlInitialValue.value = html
  pendingEditHtml.value = { from: range.from, to: range.to, html }
  editHtmlDialogOpen.value = true
  actionsMenuVisible.value = false
}

function closeEditHtmlDialog() {
  editHtmlDialogOpen.value = false
  pendingEditHtml.value = null
  editHtmlInitialValue.value = ''
}

function confirmEditHtml(newHtml: string) {
  const ed = editor.value
  const pending = pendingEditHtml.value
  if (!ed || !pending) {
    closeEditHtmlDialog()
    return
  }

  if (newHtml !== pending.html) {
    ed.chain().focus().deleteRange({ from: pending.from, to: pending.to }).insertContentAt(pending.from, newHtml).run()
  }
  closeEditHtmlDialog()
}

function runAddFootnote() {
  const ed = editor.value
  if (!ed) return

  syncingFootnotes = true
  try {
    const nextIndex = getNextFootnoteIndex(ed)
    const id = generateFootnoteId()
    const markerText = String(nextIndex)
    const { state, view } = ed
    const insertPos = state.selection.to
    const footnoteMark = state.schema.marks.footnote?.create({ id, index: nextIndex })
    if (!footnoteMark) return

    const textNode = state.schema.text(markerText, [footnoteMark])
    let tr = state.tr.insert(insertPos, textNode)
    const nextPos = insertPos + markerText.length
    tr = tr.setSelection(TextSelection.create(tr.doc, nextPos))
    tr = tr.setStoredMarks([])
    view.dispatch(tr)
    ed.view.focus()

    appendFootnoteListItem(ed, nextIndex, id)
    ed.chain().focus().setTextSelection(Math.max(1, Math.min(nextPos, ed.state.doc.content.size))).run()
  } finally {
    syncingFootnotes = false
  }

  syncFootnotesConsistency(ed)
}

function getNextFootnoteIndex(ed: Editor) {
  let maxIndex = 0
  ed.state.doc.descendants((node) => {
    if (!node.marks?.length) return
    for (const mark of node.marks) {
      if (mark.type.name !== 'footnote') continue
      const index = Number(mark.attrs.index ?? 0)
      if (Number.isFinite(index)) {
        maxIndex = Math.max(maxIndex, index)
      }
    }
  })
  return maxIndex + 1
}

function appendFootnoteListItem(ed: Editor, index: number, id: string) {
  const scaffold = findFootnoteScaffold(ed)
  const itemContent = {
    type: 'listItem',
    attrs: { footnoteId: id },
    content: [{
      type: 'paragraph',
      content: []
    }]
  }

  if (!scaffold) {
    const endPos = footnoteInsertPos(ed)
    ed.chain().focus().insertContentAt(endPos, {
      type: 'footnotesBlock',
      content: [{
        type: 'orderedList',
        content: [itemContent]
      }]
    }).run()
    return
  }

  const appendPos = scaffold.listPos + scaffold.listNode.nodeSize - 1
  ed.chain().focus().insertContentAt(appendPos, itemContent).run()
}

function findFootnoteScaffold(ed: Editor) {
  let scaffold: { blockPos: number, listPos: number, listNode: any } | null = null
  const children: Array<{ node: any, pos: number }> = []

  ed.state.doc.forEach((node, pos, _index) => {
    children.push({ node, pos })

    if (scaffold || node.type.name !== 'footnotesBlock') {
      return
    }

    const listNode = node.firstChild
    if (!listNode || listNode.type.name !== 'orderedList') {
      return
    }

    scaffold = {
      blockPos: pos,
      listPos: pos + 1,
      listNode
    }
  })

  if (scaffold) {
    return scaffold
  }

  for (let i = children.length - 1; i >= 1; i -= 1) {
    const list = children[i]
    const heading = children[i - 1]
    if (!heading || !list) continue
    if (heading.node.type.name !== 'paragraph' || list.node.type.name !== 'orderedList') continue
    if (heading.node.textContent.trim().toLowerCase() !== 'footnotes') continue

    return {
      blockPos: heading.pos,
      listPos: list.pos,
      listNode: list.node
    }
  }

  return scaffold
}

function syncFootnotesConsistency(ed: Editor) {
  if (syncingFootnotes) {
    return false
  }

  const normalized = normalizeFootnotesDoc(ed.getJSON() as JsonContent)
  if (!normalized.changed) {
    return false
  }

  syncingFootnotes = true
  const { from, to } = ed.state.selection
  ed.commands.setContent(normalized.doc, false)

  const max = Math.max(1, ed.state.doc.content.size)
  const nextFrom = Math.max(1, Math.min(from, max))
  const nextTo = Math.max(1, Math.min(to, max))
  ed.chain().focus().setTextSelection({ from: Math.min(nextFrom, nextTo), to: Math.max(nextFrom, nextTo) }).run()
  syncingFootnotes = false
  return true
}

function normalizeFootnotesDoc(doc: JsonContent): { doc: JsonContent, changed: boolean } {
  const draft = JSON.parse(JSON.stringify(doc)) as JsonContent
  const rootChildren = Array.isArray(draft.content) ? draft.content : []
  let changed = false

  if (rootChildren.length >= 2) {
    for (let i = rootChildren.length - 1; i >= 1; i -= 1) {
      const orderedList = rootChildren[i]
      const heading = rootChildren[i - 1]
      if (!heading || !orderedList) continue
      if (heading.type !== 'paragraph' || orderedList.type !== 'orderedList') continue
      if (flattenJsonNodeText(heading).trim().toLowerCase() !== 'footnotes') continue

      const block: JsonContent = {
        type: 'footnotesBlock',
        content: [orderedList]
      }
      rootChildren.splice(i - 1, 2, block)
      changed = true
      break
    }
  }

  const footnotesPosition = moveFootnotesBlockToBottom(rootChildren, rootChildren.findIndex((node) => node.type === 'footnotesBlock'))
  let footnotesBlockIndex = footnotesPosition.index
  if (footnotesPosition.changed) {
    changed = true
  }
  let refs = collectFootnoteRefs(rootChildren, footnotesBlockIndex)
  let refOrder = refs.order

  if (footnotesBlockIndex < 0) {
    if (!refOrder.length) {
      return { doc: draft, changed }
    }

    rootChildren.push({
      type: 'footnotesBlock',
      content: [{
        type: 'orderedList',
        content: refOrder.map((id) => ({
          type: 'listItem',
          attrs: { footnoteId: id },
          content: [{ type: 'paragraph', content: [] }]
        }))
      }]
    })
    footnotesBlockIndex = rootChildren.length - 1
    changed = true
  }

  const footnotesBlock = rootChildren[footnotesBlockIndex]
  if (!footnotesBlock) {
    return { doc: draft, changed }
  }
  if (!footnotesBlock.content || !footnotesBlock.content.length || footnotesBlock.content[0]?.type !== 'orderedList') {
    footnotesBlock.content = [{ type: 'orderedList', content: [] }]
    changed = true
  }

  const orderedList = footnotesBlock.content?.[0]
  const listItems = Array.isArray(orderedList?.content) ? orderedList!.content! : []

  const footnoteItemNormalization = extractStandaloneBlocksFromFootnoteItems(listItems)
  if (footnoteItemNormalization.changed) {
    if (footnoteItemNormalization.escapedBlocks.length) {
      rootChildren.splice(footnotesBlockIndex, 0, ...footnoteItemNormalization.escapedBlocks)
      footnotesBlockIndex += footnoteItemNormalization.escapedBlocks.length
    }
    refs = collectFootnoteRefs(rootChildren, footnotesBlockIndex)
    refOrder = refs.order
    changed = true
  }

  const existingIds = refs.order
  for (let i = 0; i < listItems.length; i += 1) {
    const item = listItems[i]
    if (!item || item.type !== 'listItem') continue
    const attrs = (item.attrs && typeof item.attrs === 'object') ? item.attrs as Record<string, unknown> : {}
    const existingId = typeof attrs.footnoteId === 'string' ? attrs.footnoteId.trim() : ''
    if (!existingId) {
      const fallbackId = existingIds[i]
      if (fallbackId) {
        item.attrs = { ...attrs, footnoteId: fallbackId }
        changed = true
      }
    }
  }

  const itemById = new Map<string, JsonContent>()
  const itemIds: string[] = []
  for (const item of listItems) {
    if (!item || item.type !== 'listItem') continue
    const id = String(item.attrs?.footnoteId ?? '').trim()
    if (!id || itemById.has(id)) continue
    itemById.set(id, item)
    itemIds.push(id)
  }

  const itemSet = new Set(itemIds)
  const keepIds = refOrder.filter((id) => itemSet.has(id))

  for (const refNode of refs.nodes) {
    const mark = refNode.marks?.find((entry) => entry.type === 'footnote')
    const id = String(mark?.attrs?.id ?? '').trim()
    if (!id || keepIds.includes(id)) {
      continue
    }

    refNode.text = ''
    changed = true
  }
  pruneEmptyTextNodes(rootChildren)

  const nextItems = keepIds.map((id) => {
    const existing = itemById.get(id)
    if (existing) {
      const attrs = (existing.attrs && typeof existing.attrs === 'object') ? existing.attrs as Record<string, unknown> : {}
      const currentText = flattenJsonNodeText(existing).trim()
      if (/^footnote\s+\d+$/i.test(currentText)) {
        existing.content = [{ type: 'paragraph', content: [] }]
      }
      existing.attrs = { ...attrs, footnoteId: id }
      return existing
    }

    return {
      type: 'listItem',
      attrs: { footnoteId: id },
      content: [{ type: 'paragraph', content: [] }]
    } as JsonContent
  })

  if (JSON.stringify(nextItems) !== JSON.stringify(listItems)) {
    orderedList!.content = nextItems
    changed = true
  }

  const newIndexById = new Map<string, number>()
  keepIds.forEach((id, index) => {
    newIndexById.set(id, index + 1)
  })

  for (const refNode of refs.nodes) {
    if (!refNode.marks) continue

    const nextMarks = refNode.marks.map((mark) => {
      if (mark.type !== 'footnote') return mark
      const id = String(mark.attrs?.id ?? '').trim()
      const nextIndex = newIndexById.get(id)
      if (!id || !nextIndex) {
        changed = true
        return null
      }

      const nextAttrs = { ...(mark.attrs ?? {}), id, index: nextIndex }
      if ((mark.attrs?.index ?? null) !== nextIndex) {
        changed = true
      }

      if (refNode.text !== String(nextIndex)) {
        refNode.text = String(nextIndex)
        changed = true
      }

      return { ...mark, attrs: nextAttrs }
    }).filter(Boolean) as Array<{ type: string, attrs?: Record<string, unknown> }>

    if (nextMarks.length !== refNode.marks.length) {
      changed = true
    }

    refNode.marks = nextMarks
  }
  pruneEmptyTextNodes(rootChildren)

  if (!keepIds.length) {
    rootChildren.splice(footnotesBlockIndex, 1)
    changed = true
  }

  draft.content = rootChildren
  return { doc: draft, changed }
}

function collectFootnoteRefs(children: JsonContent[], footnotesBlockIndex: number) {
  const order: string[] = []
  const seen = new Set<string>()
  const nodes: Array<JsonContent & { marks?: Array<{ type: string, attrs?: Record<string, unknown> }> }> = []

  const walk = (node: JsonContent) => {
    if (node.type === 'text') {
      const marks = Array.isArray(node.marks) ? node.marks : []
      for (const mark of marks) {
        if (mark.type !== 'footnote') continue
        const id = String(mark.attrs?.id ?? '').trim()
        if (!id) continue
        nodes.push(node as JsonContent & { marks?: Array<{ type: string, attrs?: Record<string, unknown> }> })
        if (!seen.has(id)) {
          seen.add(id)
          order.push(id)
        }
      }
    }

    if (!Array.isArray(node.content)) {
      return
    }
    for (const child of node.content) {
      walk(child)
    }
  }

  children.forEach((node, index) => {
    if (index === footnotesBlockIndex) {
      return
    }
    walk(node)
  })

  return { order, nodes }
}

function moveFootnotesBlockToBottom(children: JsonContent[], footnotesBlockIndex: number) {
  if (footnotesBlockIndex < 0) {
    return { index: footnotesBlockIndex, changed: false }
  }

  const [footnotesBlock] = children.splice(footnotesBlockIndex, 1)
  if (!footnotesBlock) {
    return { index: -1, changed: true }
  }

  const targetIndex = children.length
  children.splice(targetIndex, 0, footnotesBlock)
  return { index: targetIndex, changed: targetIndex !== footnotesBlockIndex }
}

function extractStandaloneBlocksFromFootnoteItems(listItems: JsonContent[]) {
  const escapedBlocks: JsonContent[] = []
  let changed = false

  for (const item of listItems) {
    if (!item || item.type !== 'listItem') continue

    const children = Array.isArray(item.content) ? item.content : []
    let keptParagraph: JsonContent | null = null
    const nextContent: JsonContent[] = []

    for (const child of children) {
      if (child.type === 'paragraph' && !keptParagraph) {
        keptParagraph = child
        nextContent.push(child)
        continue
      }

      escapedBlocks.push(child.type === 'text' ? { type: 'paragraph', content: [child] } : child)
    }

    if (!keptParagraph) {
      nextContent.push({ type: 'paragraph', content: [] })
    }

    if (JSON.stringify(item.content ?? []) !== JSON.stringify(nextContent)) {
      item.content = nextContent
      changed = true
    }
  }

  return { escapedBlocks, changed }
}

function flattenJsonNodeText(node: JsonContent): string {
  if (node.type === 'text') {
    return node.text ?? ''
  }

  if (!Array.isArray(node.content)) {
    return ''
  }

  return node.content.map(flattenJsonNodeText).join(' ')
}

function pruneEmptyTextNodes(nodes: JsonContent[]) {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i]
    if (!node) {
      continue
    }

    if (Array.isArray(node.content)) {
      pruneEmptyTextNodes(node.content)
    }

    if (node.type === 'text' && !node.text) {
      nodes.splice(i, 1)
      continue
    }

  }
}

function footnoteInsertPos(ed: Editor) {
  const last = ed.state.doc.lastChild
  if (last && last.type.name === 'paragraph' && last.content.size === 0) {
    return ed.state.doc.content.size - last.nodeSize
  }
  return ed.state.doc.content.size
}

function jumpToFootnoteItem(view: EditorView, index: number) {
  const ed = editor.value
  if (!ed) return false
  const scaffold = findFootnoteScaffold(ed)
  if (!scaffold) return false

  let targetPos: number | null = null
  scaffold.listNode.forEach((_node: any, offset: number, childIndex: number) => {
    if (childIndex === index - 1) {
      targetPos = scaffold.listPos + 1 + offset + 1
    }
  })

  if (targetPos === null) return false
  const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(targetPos)))
  view.dispatch(tr)
  view.focus()
  highlightFootnoteTarget(targetPos)
  return true
}

function resolveFootnoteIndexFromAnchor(view: EditorView, anchorId: string, target: HTMLElement | null, prefix: 'fn-' | 'fnref-') {
  const footnoteSup = target?.closest('.footnote-ref') as HTMLElement | null
  const elementIndex = Number(footnoteSup?.getAttribute('data-footnote-index') ?? '')
  if (Number.isFinite(elementIndex) && elementIndex > 0) {
    return elementIndex
  }

  return findFootnoteIndexById(view, anchorId.slice(prefix.length))
}

function findFootnoteIndexById(view: EditorView, footnoteId: string) {
  let index = 0

  view.state.doc.descendants((node) => {
    if (index > 0 || !node.marks?.length) return false
    for (const mark of node.marks) {
      if (mark.type.name !== 'footnote') continue
      if (String(mark.attrs.id ?? '') !== footnoteId) continue
      const value = Number(mark.attrs.index ?? 0)
      if (Number.isFinite(value) && value > 0) {
        index = value
        return false
      }
    }
    return undefined
  })

  return index
}

function jumpToFootnoteReference(view: EditorView, index: number) {
  let targetPos: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (!node.marks?.length) return
    for (const mark of node.marks) {
      if (mark.type.name !== 'footnote') continue
      if (Number(mark.attrs.index ?? 0) === index) {
        targetPos = pos + node.nodeSize
      }
    }
  })

  if (targetPos === null) return false
  const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(targetPos)))
  view.dispatch(tr)
  view.focus()
  highlightFootnoteTarget(targetPos)
  return true
}

function highlightFootnoteTarget(pos: number) {
  const view = editor.value?.view
  if (!view) return

  const coords = view.coordsAtPos(Math.max(1, Math.min(pos, view.state.doc.content.size)))
  const element = document.elementFromPoint(coords.left + 4, coords.top + 4) as HTMLElement | null
  const target = element?.closest('.footnote-ref, li, p') as HTMLElement | null
  if (!target) return

  target.classList.add('footnote-jump-highlight')
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    target.classList.remove('footnote-jump-highlight')
  }, 900)
}

// ─── SLASH COMMAND ───────────────────────────────────────────────────────────

function isAtBlockStart(view: EditorView, from: number) {
  const resolved = view.state.doc.resolve(from)
  if (isInsideNode(resolved, 'footnotesBlock')) {
    return false
  }

  return resolved.parent.type.name === 'paragraph' && resolved.parentOffset === 0
}

function openSlashMenu(view: EditorView, from: number) {
  slashRange.value = { from, to: from + 1 }
  slashQuery.value = ''
  slashSelectedIndex.value = 0
  updateSlashMenuPosition(view, from)
  slashOpen.value = true
}

function estimateSlashMenuHeight() {
  const rowsHeight = slashItems.value.length
    ? slashItems.value.length * SLASH_MENU_ITEM_HEIGHT
    : SLASH_MENU_EMPTY_HEIGHT

  return Math.min(SLASH_MENU_MAX_HEIGHT, SLASH_MENU_HEADER_HEIGHT + rowsHeight)
}

function updateSlashMenuPosition(view: EditorView, pos: number) {
  if (!import.meta.client) {
    return
  }

  const maxPos = Math.max(1, view.state.doc.content.size)
  const safePos = Math.max(1, Math.min(pos, maxPos))
  const coords = view.coordsAtPos(safePos)
  const menuHeight = estimateSlashMenuHeight()

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const maxLeft = viewportWidth - SLASH_MENU_WIDTH - SLASH_MENU_MARGIN
  const left = Math.max(SLASH_MENU_MARGIN, Math.min(coords.left, maxLeft))

  const spaceBelow = viewportHeight - coords.bottom - SLASH_MENU_MARGIN
  const spaceAbove = coords.top - SLASH_MENU_MARGIN

  let top = coords.bottom + SLASH_MENU_GAP
  if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
    top = Math.max(SLASH_MENU_MARGIN, coords.top - menuHeight - SLASH_MENU_GAP)
  } else {
    const maxTop = viewportHeight - menuHeight - SLASH_MENU_MARGIN
    top = Math.max(SLASH_MENU_MARGIN, Math.min(top, maxTop))
  }

  slashPosition.value = { top, left }
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
  updateSlashMenuPosition(ed.view, slashRange.value.from)
}

function closeSlashMenu() {
  slashOpen.value = false
  slashQuery.value = ''
  slashRange.value = null
  slashSelectedIndex.value = 0
}

function dismissSlashMenu() {
  const ed = editor.value
  if (ed && slashRange.value) {
    const from = slashRange.value.from
    const to = ed.state.selection.from
    closeSlashMenu()
    ed.chain().focus().deleteRange({ from, to }).run()
  } else {
    closeSlashMenu()
  }
}

function handleSlashPick(name: string) {
  const ed = editor.value
  if (!ed || !slashRange.value) return

  const from = slashRange.value.from
  const to = ed.state.selection.from
  closeSlashMenu()

  // Delete the typed "/query" text
  ed.chain().focus().deleteRange({ from, to }).run()

  const escapedPos = getEscapedSlashInsertPos(ed)
  if (escapedPos !== null) {
    insertBlockAtPosition(name, escapedPos)
    return
  }

  // Check if current paragraph is now empty
  const { $from } = ed.state.selection
  const textblockRange = getCurrentTextblockRange(ed)
  const topLevelRange = getTopLevelBlockRange(ed)
  const isEmptyParagraph = $from.parent.type.name === 'paragraph' && $from.parent.textContent.length === 0

  if (isEmptyParagraph && textblockRange) {
    insertBlockReplacingRange(name, textblockRange)
  } else {
    insertBlockAtPosition(name, topLevelRange?.to ?? ed.state.selection.to)
  }
}

function getCurrentTextblockRange(ed: Editor) {
  const { $from } = ed.state.selection
  if (!$from.parent.isTextblock) {
    return null
  }

  return { from: $from.before($from.depth), to: $from.after($from.depth) }
}

function getTopLevelBlockRange(ed: Editor, pos = ed.state.selection.from) {
  const safePos = Math.max(0, Math.min(pos, ed.state.doc.content.size))
  const resolved = ed.state.doc.resolve(safePos)

  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth - 1).type.name === 'doc') {
      return {
        from: resolved.before(depth),
        to: resolved.after(depth),
        node: resolved.node(depth)
      }
    }
  }

  return null
}

function getEscapedSlashInsertPos(ed: Editor) {
  const { $from } = ed.state.selection
  if ($from.depth <= 1 || isInsideAllowedNestedBlockContainer($from)) {
    return null
  }

  const topLevelRange = getTopLevelBlockRange(ed)
  if (!topLevelRange) {
    return null
  }

  return isInsideNode($from, 'footnotesBlock') ? topLevelRange.from : topLevelRange.to
}

function isInsideAllowedNestedBlockContainer(resolved: ResolvedPos) {
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (ALLOWED_NESTED_BLOCK_CONTAINERS.has(resolved.node(depth).type.name)) {
      return true
    }
  }

  return false
}

function isInsideNode(resolved: ResolvedPos, nodeName: string) {
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name === nodeName) {
      return true
    }
  }

  return false
}

function getNestedTextOnlySelectionRange(resolved: ResolvedPos) {
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name === 'tabPanel') {
      return getTextblockContentRange(resolved, depth)
    }
  }

  return null
}

function getTextblockContentRange(resolved: ResolvedPos, depth: number) {
  const from = resolved.start(depth)
  const to = resolved.end(depth)
  let textFrom: number | null = null
  let textTo: number | null = null

  resolved.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) {
      return true
    }

    textFrom ??= pos + 1
    textTo = pos + node.nodeSize - 1
    return false
  })

  return textFrom !== null && textTo !== null ? { from: textFrom, to: textTo } : null
}

function handleProtectedFootnotesEnter(view: EditorView) {
  const { state } = view
  const { selection } = state
  if (!selection.empty) {
    return false
  }

  const footnotesRange = findTopLevelBlockRangeByTypeFromDoc(state.doc, 'footnotesBlock')
  if (!footnotesRange) {
    return false
  }

  const { $from } = selection
  const currentRange = getTopLevelBlockRangeFromResolved($from)
  if (!currentRange) {
    return false
  }

  const insideFootnotes = currentRange.node.type.name === 'footnotesBlock'
  const endsImmediatelyBeforeFootnotes = currentRange.to === footnotesRange.from
    && $from.parent.isTextblock
    && $from.parentOffset === $from.parent.content.size

  if (!insideFootnotes && !endsImmediatelyBeforeFootnotes) {
    return false
  }

  const paragraph = state.schema.nodes.paragraph?.createAndFill()
  if (!paragraph) {
    return false
  }

  const insertPos = footnotesRange.from
  const tr = state.tr.insert(insertPos, paragraph)
  tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
  view.dispatch(tr)
  view.focus()
  return true
}

function getTopLevelBlockRangeFromResolved(resolved: ResolvedPos) {
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth - 1).type.name === 'doc') {
      return {
        from: resolved.before(depth),
        to: resolved.after(depth),
        node: resolved.node(depth)
      }
    }
  }

  return null
}

function findTopLevelBlockRangeByTypeFromDoc(doc: Editor['state']['doc'], typeName: string): { from: number; to: number } | null {
  let range: { from: number; to: number } | null = null

  doc.forEach((node, pos) => {
    if (!range && node.type.name === typeName) {
      range = { from: pos, to: pos + node.nodeSize }
    }
  })

  return range
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

  const safePos = normalizeStandaloneBlockInsertPos(ed, pos, name)

  if (name === 'embed') {
    insertEmbedAtPosition(safePos)
    return
  }

  if (name === 'image') {
    pendingImageInsertPos.value = safePos
    mediaPickerOpen.value = true
    return
  }

  if (name === 'table') {
    ed.chain().focus().insertContentAt(safePos, createTableContent()).run()
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

function normalizeStandaloneBlockInsertPos(ed: Editor, pos: number, name?: string) {
  const safePos = Math.max(0, Math.min(pos, ed.state.doc.content.size))
  if (name === 'footnotesBlock') {
    return footnoteInsertPos(ed)
  }

  const footnotesRange = findTopLevelBlockRangeByType(ed, 'footnotesBlock')
  if (!footnotesRange || safePos <= footnotesRange.from) {
    return safePos
  }

  return footnotesRange.from
}

function findTopLevelBlockRangeByType(ed: Editor, typeName: string): { from: number; to: number } | null {
  let range: { from: number; to: number } | null = null

  ed.state.doc.forEach((node, pos) => {
    if (!range && node.type.name === typeName) {
      range = { from: pos, to: pos + node.nodeSize }
    }
  })

  return range
}

function insertBlockReplacingRange(name: string, range: { from: number; to: number }) {
  const ed = editor.value
  if (!ed) return

  if (name === 'embed') {
    ed.chain().focus().deleteRange(range).run()
    insertEmbedAtPosition(range.from)
    return
  }

  if (name === 'image') {
    pendingImageInsertPos.value = range.from
    ed.chain().focus().deleteRange(range).run()
    mediaPickerOpen.value = true
    return
  }

  if (name === 'table') {
    ed.chain().focus().insertContentAt(range, createTableContent()).run()
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

  ed.chain().focus().insertContentAt(range, content).run()
}

function insertEmbedAtPosition(pos: number) {
  const ed = editor.value
  if (!ed) return

  pendingEmbedInsertPos.value = pos
  embedUrlDialogOpen.value = true
}

function closeEmbedUrlDialog() {
  embedUrlDialogOpen.value = false
  pendingEmbedInsertPos.value = null
}

function validateEmbedUrlInput(rawUrl: string) {
  const normalizedUrl = normalizeEmbedUrl(rawUrl)
  return normalizedUrl ? null : 'Please enter a valid URL, e.g. https://example.com'
}

function confirmEmbedUrl(rawUrl: string) {
  const ed = editor.value
  const pos = pendingEmbedInsertPos.value
  const normalizedUrl = normalizeEmbedUrl(rawUrl)
  if (!ed || pos === null || !normalizedUrl) {
    closeEmbedUrlDialog()
    return
  }

  const embedHtml = buildEmbedHtmlFromUrl(normalizedUrl)
  const safePos = normalizeStandaloneBlockInsertPos(ed, pos, 'embed')
  ed.chain().focus().insertContentAt(safePos, {
    type: 'customHtml',
    attrs: { html: embedHtml }
  }).run()
  closeEmbedUrlDialog()
}

function normalizeEmbedUrl(rawUrl: string) {
  try {
    return new URL(rawUrl).toString()
  } catch {
    try {
      return new URL(`https://${rawUrl}`).toString()
    } catch {
      return null
    }
  }
}

function buildEmbedHtmlFromUrl(url: string) {
  const parsed = new URL(url)
  const hostname = parsed.hostname.toLowerCase()
  const pathname = parsed.pathname.toLowerCase()

  const youtubeId = getYouTubeVideoId(parsed)
  if (youtubeId) {
    const src = `https://www.youtube-nocookie.com/embed/${youtubeId}`
    return `<div style="max-width:960px;margin:0 auto;">
  <iframe
    src="${escapeHtmlAttr(src)}"
    title="YouTube video"
    style="width:100%;height:420px;border:0;border-radius:12px;"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
    loading="lazy"
  ></iframe>
</div>`
  }

  const isVideoFile = /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(pathname)
  if (isVideoFile) {
    return `<div style="max-width:960px;margin:0 auto;">
  <video controls style="width:100%;max-height:70vh;border-radius:12px;background:#000;" src="${escapeHtmlAttr(url)}"></video>
</div>`
  }

  const isAudioFile = /\.(mp3|wav|ogg|flac|m4a|aac)(\?|#|$)/i.test(pathname)
  if (isAudioFile) {
    return `<div style="max-width:960px;margin:0 auto;padding:1rem;">
  <audio controls style="width:100%;" src="${escapeHtmlAttr(url)}"></audio>
</div>`
  }

  const vimeoMatch = hostname.includes('vimeo.com')
    ? parsed.pathname.match(/\/(\d+)(?:$|\/)/)
    : null
  if (vimeoMatch?.[1]) {
    const src = `https://player.vimeo.com/video/${vimeoMatch[1]}`
    return `<div style="max-width:960px;margin:0 auto;">
  <iframe
    src="${escapeHtmlAttr(src)}"
    title="Vimeo video"
    style="width:100%;height:420px;border:0;border-radius:12px;"
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen
    loading="lazy"
  ></iframe>
</div>`
  }

  // Generic website embed fallback. Some sites block framing by policy.
  return `<div style="max-width:1100px;margin:0 auto;">
  <iframe
    src="${escapeHtmlAttr(url)}"
    title="Embedded webpage"
    style="width:100%;height:720px;border:0;border-radius:12px;background:#fff;"
    loading="lazy"
    referrerpolicy="no-referrer"
  ></iframe>
  <p style="margin:0.5rem 0 0;font:500 13px ui-sans-serif,system-ui,sans-serif;color:#64748b;">If this site blocks embedding, open it in a new tab: <a href="${escapeHtmlAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(url)}</a></p>
</div>`
}

function getYouTubeVideoId(parsed: URL) {
  const hostname = parsed.hostname.toLowerCase()
  const pathname = parsed.pathname

  if (hostname === 'youtu.be') {
    const id = pathname.replace(/^\//, '').split('/')[0]
    return id || null
  }

  if (hostname.endsWith('youtube.com') || hostname.endsWith('youtube-nocookie.com')) {
    if (pathname.startsWith('/watch')) {
      return parsed.searchParams.get('v')
    }

    const segments = pathname.split('/').filter(Boolean)
    if (segments[0] === 'embed' && segments[1]) {
      return segments[1]
    }
    if (segments[0] === 'shorts' && segments[1]) {
      return segments[1]
    }
  }

  return null
}

function escapeHtmlAttr(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeHtmlText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
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
  if (activeBlockRange.value?.parentDepth !== 0) {
    event.preventDefault()
    return
  }

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
  if (moved.type === 'footnotesBlock') return

  const adjustedTarget = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex
  const footnotesIndex = content.findIndex((node) => node.type === 'footnotesBlock')
  const nextTarget = footnotesIndex >= 0 ? Math.min(adjustedTarget, footnotesIndex) : adjustedTarget
  content.splice(nextTarget, 0, moved)

  ed.commands.setContent({ type: 'doc', content }, false)
  emit('update:modelValue', ed.getJSON() as JsonContent)

  nextTick(() => {
    if (!editor.value) return
    const newPos = resolveBlockPosition(editor.value, nextTarget)
    editor.value.chain().focus().setTextSelection(newPos).run()
    animateDroppedBlock(nextTarget)
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
    ed.chain().focus().insertContentAt(normalizeStandaloneBlockInsertPos(ed, relatedPostPendingPos.value, 'relatedPost'), {
      type: 'paragraph',
      content: [
        { type: 'relatedPost', attrs: { target, label } },
        { type: 'text', text: ' ' }
      ]
    }).run()
  } else if (relatedPostMode.value === 'replace' && relatedPostPendingRange.value) {
    ed.chain().focus().insertContentAt(relatedPostPendingRange.value, {
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
  const tableText = [
    ['Header 1', 'Header 2', 'Header 3'],
    ['Cell 1', 'Cell 2', 'Cell 3'],
    ['Cell 4', 'Cell 5', 'Cell 6']
  ]

  return {
    type: 'table',
    content: tableText.map((row, rowIndex) => ({
      type: 'tableRow',
      content: row.map((text) => ({
        type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
      }))
    }))
  }
}

function pastePlainTextInsideTabPanel(view: EditorView, event: ClipboardEvent) {
  if (!isInsideNode(view.state.selection.$from, 'tabPanel')) {
    return false
  }

  const clipboard = event.clipboardData
  const text = clipboard?.getData('text/plain') ?? ''
  if (!text) {
    return false
  }

  const html = clipboard?.getData('text/html') ?? ''
  const hasTabBlockMarkup = /data-type=["'](?:tabs-block|tab-panel)["']|class=["'][^"']*(?:tabs-block|tabs-block-panel)/.test(html)
  if (!hasTabBlockMarkup) {
    return false
  }

  event.preventDefault()
  insertPlainTextAtSelection(view, text)
  return true
}

function insertPlainTextAtSelection(view: EditorView, text: string) {
  const normalized = text.replace(/\r\n?/g, '\n')
  if (!normalized.includes('\n')) {
    view.dispatch(view.state.tr.insertText(normalized))
    return
  }

  editor.value?.chain().focus().insertContent(plainTextToParagraphs(normalized)).run()
}

function plainTextToParagraphs(text: string): JsonContent[] {
  return text.split(/\n{2,}/).map((paragraph) => {
    const lines = paragraph.split('\n')
    const content = lines.flatMap((line, index) => {
      const nodes: JsonContent[] = line ? [{ type: 'text', text: line }] : []
      if (index < lines.length - 1) {
        nodes.push({ type: 'hardBreak' })
      }
      return nodes
    })

    return { type: 'paragraph', content }
  })
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
    attrs: {
      src: toPublicMediaUrl(file.hash || file.id || file.url),
      alt: file.original_name,
      sourceSize: 'full',
      displaySize: 'fill-container',
      displayPercent: 100,
      displayPx: null,
      width: null,
      height: null,
      naturalWidth: typeof file.width === 'number' ? file.width : null,
      naturalHeight: typeof file.height === 'number' ? file.height : null,
      widthPercent: 100
    }
  }))

  if (insertPos !== null) {
    ed.chain().focus().insertContentAt(normalizeStandaloneBlockInsertPos(ed, insertPos, 'image'), content).run()
  } else {
    for (const node of content) {
      const chain = ed.chain().focus() as any
      chain.setImage(node.attrs).run()
    }
  }

  pendingImageInsertPos.value = null
}

async function uploadImage(file: File) {
  try {
    const formData = new FormData()
    formData.append('file', file)
    const asset = await $fetch<MediaRecord>('/api/admin/upload', {
      method: 'POST',
      body: formData
    })
    if (asset.url) {
      const imageSrc = toPublicMediaUrl(asset.hash || asset.url)
      const ed = editor.value
      const insertPos = pendingImageInsertPos.value
      if (ed && insertPos !== null) {
        ed.chain().focus().insertContentAt(normalizeStandaloneBlockInsertPos(ed, insertPos, 'image'), {
          type: 'image',
          attrs: {
            src: imageSrc,
            alt: file.name,
            sourceSize: 'full',
            displaySize: 'fill-container',
            displayPercent: 100,
            displayPx: null,
            widthPercent: 100
          }
        }).run()
      } else {
        const chain = ed?.chain().focus() as any
        chain?.setImage({
          src: imageSrc,
          alt: file.name,
          sourceSize: 'full',
          displaySize: 'fill-container',
          displayPercent: 100,
          displayPx: null,
          widthPercent: 100
        }).run()
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
      mediaSrc: toPublicMediaUrl(file.hash || file.id || file.url),
      mediaAlt: file.original_name ?? '',
      mediaName: file.original_name ?? '',
      mediaMime: file.mime_type ?? '',
      mediaSize: typeof file.size === 'number' ? file.size : null,
      mediaSourceSize: 'full',
      mediaDisplaySize: 'fill-container',
      mediaDisplayPercent: 100,
      mediaDisplayPx: null,
      blockWidth: node.attrs.blockWidth ?? 'content',
      mediaWidth: null,
      mediaHeight: null,
      mediaNaturalWidth: typeof file.width === 'number' ? file.width : null,
      mediaNaturalHeight: typeof file.height === 'number' ? file.height : null,
      mediaWidthPercent: 100
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
        handleMediaTextPicked([{ ...asset, url: resolveMediaUrl(asset.url) }])
      }
    } catch {
      debugEditor('Media+Text upload failed.')
    }
  }
  input.click()
}

function promptRemoteUrlForMediaText() {
  if (mediaTextTargetPos.value === null) return
  mediaTextRemoteUrlDialogOpen.value = true
}

function closeRemoteMediaTextDialog() {
  mediaTextRemoteUrlDialogOpen.value = false
}

function confirmRemoteMediaTextUrl(url: string) {
  mediaTextRemoteUrlDialogOpen.value = false
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

function ensureTrailingParagraph(ed: Editor) {
  const last = ed.state.doc.lastChild
  if (last && last.type.name === 'footnotesBlock') {
    return false
  }

  if (last && last.type.name === 'paragraph' && last.content.size === 0) {
    return false
  }

  const paragraph = ed.schema.nodes.paragraph?.createAndFill()
  if (!paragraph) {
    return false
  }

  const tr = ed.state.tr.insert(ed.state.doc.content.size, paragraph)
  ed.view.dispatch(tr)
  return true
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
  const editableEnd = editableDocumentEndPos(ed)
  const editableTail = findTopLevelBlockEndingAt(ed, editableEnd)
  if (editableTail?.node.type.name === 'paragraph' && editableTail.node.content.size === 0) {
    ed.chain().focus().setTextSelection(editableTail.from + 1).run()
    return
  }
  ed.chain().focus().insertContentAt(editableEnd, { type: 'paragraph' }).run()
}

function editableDocumentEndPos(ed: Editor) {
  return findTopLevelBlockRangeByType(ed, 'footnotesBlock')?.from ?? ed.state.doc.content.size
}

function findTopLevelBlockEndingAt(ed: Editor, pos: number): { from: number; to: number; node: ProseMirrorNode } | null {
  let result: { from: number; to: number; node: ProseMirrorNode } | null = null

  ed.state.doc.forEach((node, offset) => {
    const to = offset + node.nodeSize
    if (to === pos) {
      result = { from: offset, to, node }
    }
  })

  return result
}

function onCustomHtmlInteract() {
  activeBlockRect.value = null
  activeBlockIndex.value = -1
  activeBlockRange.value = null
  actionsMenuVisible.value = false
}

function debugEditor(message: string) {
  if (import.meta.dev) {
    console.warn(`[BlockEditor] ${message}`)
  }
}

function syncSelectedBlock(ed: Editor) {
  const range = getActiveBlockRangeFromSelection(ed)
  if (range) {
    editorStore.selectBlock({
      id: `${range.node.type.name}:${range.from}`,
      type: range.node.type.name,
      attrs: range.node.attrs,
      pos: range.from
    })
    return
  }

  editorStore.selectBlock(null)
}

function getActiveBlockRangeFromSelection(ed: Editor): ActiveBlockRange | null {
  const { selection } = ed.state

  if (selection instanceof NodeSelection) {
    return createActiveBlockRange(ed, selection.from, selection.node)
  }

  const { $from } = selection
  let rootDepth = 0
  for (let depth = 1; depth <= $from.depth; depth += 1) {
    if (NESTED_BLOCK_ROOT_TYPES.has($from.node(depth).type.name)) {
      rootDepth = depth
    }
  }

  const targetDepth = rootDepth + 1
  if (targetDepth <= 0 || targetDepth > $from.depth) {
    return null
  }

  return createActiveBlockRangeFromDepth(ed, $from, targetDepth)
}

function createActiveBlockRangeFromDepth(ed: Editor, resolved: ResolvedPos, depth: number): ActiveBlockRange {
  const parentDepth = Math.max(0, depth - 1)
  const from = resolved.before(depth)
  const node = resolved.node(depth)

  return {
    from,
    to: resolved.after(depth),
    node,
    depth,
    parentDepth,
    parentChildCount: resolved.node(parentDepth).childCount,
    index: resolved.index(parentDepth),
    topLevelIndex: getTopLevelBlockIndexAt(ed, from)
  }
}

function createActiveBlockRange(ed: Editor, from: number, node: ProseMirrorNode): ActiveBlockRange {
  const safeFrom = Math.max(0, Math.min(from, ed.state.doc.content.size))
  const resolved = ed.state.doc.resolve(safeFrom)
  const parentDepth = resolved.depth

  return {
    from: safeFrom,
    to: safeFrom + node.nodeSize,
    node,
    depth: parentDepth + 1,
    parentDepth,
    parentChildCount: resolved.parent.childCount,
    index: resolved.index(parentDepth),
    topLevelIndex: getTopLevelBlockIndexAt(ed, safeFrom)
  }
}

function getTopLevelBlockIndexAt(ed: Editor, pos: number) {
  let blockIndex = -1
  ed.state.doc.forEach((node, offset, index) => {
    if (pos >= offset && pos < offset + node.nodeSize) {
      blockIndex = index
    }
  })
  return blockIndex
}
</script>

<style scoped>
:deep(.pandablog-block-editor .ProseMirror) {
  color: rgb(41 37 36);
  padding: 0.5rem 0;
}

@media (max-width: 1024px) {
  :deep(.pandablog-block-editor .ProseMirror) {
    padding-left: 0;
    padding-right: 0;
  }
}

.block-editor-grid {
  display: grid;
  grid-template-columns: var(--pb-editor-gutter, 32px) minmax(0, 1fr) var(--pb-editor-gutter, 32px);
  column-gap: var(--pb-editor-gap, 8px);
  align-items: start;
}

.editor-gutter-col {
  width: var(--pb-editor-gutter, 32px);
}

.editor-content-col {
  min-width: 0;
}

.block-active-overlay {
  display: grid;
  grid-template-columns: var(--pb-editor-gutter, 32px) minmax(0, 1fr) var(--pb-editor-gutter, 32px);
  column-gap: var(--pb-editor-gap, 8px);
  align-items: start;
}

.block-grid-handle,
.block-grid-add {
  margin-top: 0.25rem;
  display: inline-flex;
  height: 1.75rem;
  width: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.45rem;
  border: 1px solid rgb(153 246 228);
  background: rgb(240 253 250);
  color: rgb(15 118 110);
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.06);
  transition: background-color 0.12s ease, border-color 0.12s ease;
}

.block-grid-handle:hover,
.block-grid-add:hover {
  border-color: rgb(45 212 191);
  background: rgb(204 251 241);
}

:deep(.pandablog-block-editor .ProseMirror > *) {
  position: relative;
  margin-bottom: 0.75rem;
  border-radius: 0.4rem;
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

:deep(.pandablog-block-editor .ProseMirror pre:not(.codeblock-pre)) {
  overflow-x: auto;
  border-radius: 0.5rem;
  background: rgb(28 25 23);
  color: rgb(245 245 244);
  padding: 1rem;
}

:deep(.pandablog-block-editor .ProseMirror .separator-node) {
  min-height: 1.75rem;
  display: flex;
  align-items: center;
}

:deep(.pandablog-block-editor .ProseMirror .separator-node hr) {
  width: 100%;
}

:deep(.pandablog-block-editor .ProseMirror .footnote-ref) {
  font-size: 0.72em;
  vertical-align: super;
  margin-left: 0.08em;
  margin-right: 0.08em;
}

:deep(.pandablog-block-editor .ProseMirror .footnotes-block) {
  border-top: 2px solid rgb(87 83 78);
  margin-top: 1.5rem;
  padding-top: 0.85rem;
}

:deep(.pandablog-block-editor .ProseMirror .footnotes-block > ol) {
  counter-reset: footnote-item;
  display: grid;
  gap: 0.375rem;
  list-style: none;
  margin: 0;
  padding-left: 0;
}

:deep(.pandablog-block-editor .ProseMirror .footnotes-block li[data-footnote-id]) {
  display: grid;
  grid-template-columns: 1.75rem minmax(0, 1fr);
  gap: 0.5rem;
  scroll-margin-top: 5rem;
  counter-increment: footnote-item;
}

:deep(.pandablog-block-editor .ProseMirror .footnotes-block li[data-footnote-id]::before) {
  color: rgb(15 118 110);
  content: counter(footnote-item) ".";
  grid-column: 1;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

:deep(.pandablog-block-editor .ProseMirror .footnotes-block li[data-footnote-id] > :not(.footnote-backref)) {
  grid-column: 2;
  min-width: 0;
}

:deep(.pandablog-block-editor .ProseMirror .footnotes-block li[data-footnote-id] > :not(.footnote-backref):first-child) {
  margin-top: 0;
}

:deep(.pandablog-block-editor .ProseMirror .footnotes-block li[data-footnote-id] > :not(.footnote-backref):last-child) {
  margin-bottom: 0;
}

:deep(.pandablog-block-editor .ProseMirror a) {
  color: rgb(15 118 110);
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

:deep(.pandablog-block-editor .ProseMirror .footnote-jump-highlight) {
  outline: 2px solid rgb(13 148 136 / 0.7);
  outline-offset: 4px;
  border-radius: 0.25rem;
  transition: outline-color 220ms ease;
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
